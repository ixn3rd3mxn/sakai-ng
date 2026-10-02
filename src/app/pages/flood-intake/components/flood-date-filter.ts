import { Component, HostListener, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePicker, DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';
import { SelectButtonModule } from 'primeng/selectbutton';
import { parseIsoDate, toBuddhistYear } from '../../dashboardclone/services/date-utils';
import { BuddhistYearDirective } from '../../../shared/buddhist-year.directive';
import { DatePickerBoundsDirective } from '../../../shared/datepicker-bounds.directive';
import { OpenBelowDirective } from '../../../shared/open-below.directive';
import { FloodDataService } from '../services/flood-data.service';

// The table's date filter, as a button that opens a popover.
//
// Three people want three things from it: one day (the common case, and the
// default), a from-to span, and a hand-picked set like "the 1st, 4th and
// 28th". A plain range picker serves the first two badly - one day needs the
// same cell clicked twice - and the third not at all. So the popover carries
// a mode switch above an inline calendar, and the button's own label says
// what the table is currently narrowed to, which a 11rem input never could
// for anything but a span.
//
// A popover rather than a dialog because the table has to stay visible: in
// the multiple-days mode the operator toggles cells and watches rows appear,
// and a modal would make them pick blind and then check.
//
// Every pick applies at once and there is no apply/cancel step - the live
// model, as p-datepicker itself works. The alternative (a draft committed by
// a Done button, dismissed by clicking outside) is just as conventional,
// but mixing the two - live picks plus a Done button - is what confuses.

type DateMode = 'single' | 'multiple' | 'range';

// Tailwind's md in this project; narrower is a phone.
const PHONE_MAX_WIDTH = 768;

const MODES: { label: string; value: DateMode }[] = [
    { label: 'วันเดียว', value: 'single' },
    { label: 'หลายวัน', value: 'multiple' },
    { label: 'ช่วงวันที่', value: 'range' }
];

@Component({
    selector: 'flood-date-filter',
    standalone: true,
    imports: [FormsModule, ButtonModule, DatePickerModule, PopoverModule, SelectButtonModule, BuddhistYearDirective, DatePickerBoundsDirective, OpenBelowDirective],
    styles: [
        `
            .date-filter {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
                /* The day grid decides the width; this only keeps the popover
                   inside a phone's viewport when the row it hangs off wraps. */
                max-width: calc(100vw - 2rem);
            }
        `
    ],
    template: `
        <!-- Always "วันที่", so a pick never changes the button's width or
             the row around it. Filled while a date is applied, so the row
             still says the filter is on; what it is set to is the page
             header's date line (summary()). A class binding, not
             [outlined]: pButton reads that input once, at creation. -->
        <button
            pButton
            type="button"
            icon="pi pi-calendar"
            label="วันที่"
            class="max-sm:w-full"
            [class.p-button-outlined]="!hasValue()"
            (click)="open($event)"
        ></button>

        <!-- openBelow: under the button at every size, never flipped
             above it - see shared/open-below.directive. -->
        <p-popover #panel openBelow (onShow)="onShow()" (onHide)="onHide()">
            <div class="date-filter">
                <!-- Mode switch with an explicit close beside it. Clicking
                     outside works too, but not everyone knows that, and
                     the multiple-days mode has no other way out. -->
                <div class="flex items-center justify-between gap-2">
                    <p-selectbutton
                        [options]="modes"
                        optionLabel="label"
                        optionValue="value"
                        [ngModel]="mode()"
                        (ngModelChange)="setMode($event)"
                        [allowEmpty]="false"
                        size="small"
                    />
                    <button
                        pButton
                        type="button"
                        icon="pi pi-times"
                        class="p-button-text p-button-rounded"
                        size="small"
                        aria-label="ปิด"
                        (click)="panel.hide()"
                    ></button>
                </div>

                <!-- One picker across the three modes rather than one per
                     mode: swapping pickers empties the popover for a frame
                     and the calendar visibly blinks. p-datepicker keeps
                     mode-shaped state (a Date, a Date[], a [from, to]) that
                     a mode switch has to purge by hand - see setMode. -->
                <!-- Nothing past today: no case has been reported on a day
                     that has not come yet. -->
                <p-datepicker
                    buddhistYear
                    inline
                    [selectionMode]="mode()"
                    [ngModel]="model()"
                    [maxDate]="maxDate()"
                    (ngModelChange)="pick($event)"
                />

                <!-- No "done" button: every pick applies at once, so a
                     labelled button that only closed would read as an
                     Apply that does nothing. A day and a completed range
                     close the popover themselves; several days have no
                     natural end, so that mode is left by the close icon
                     above or a click outside. -->
                <!-- Same pair, same order, as p-datepicker's own button bar. -->
                <div class="flex justify-between items-center">
                    <button pButton type="button" label="วันนี้" class="p-button-text" size="small" (click)="pickToday()"></button>
                    <button
                        pButton
                        type="button"
                        label="ล้าง"
                        class="p-button-text"
                        size="small"
                        (click)="clear()"
                    ></button>
                </div>
            </div>
        </p-popover>
    `
})
export class FloodDateFilter {
    private readonly dataService = inject(FloodDataService);
    private readonly panel = viewChild.required(Popover);
    private readonly calendar = viewChild(BuddhistYearDirective);
    private readonly picker = viewChild(DatePicker);

    readonly modes = MODES;
    // What the popover shows. Switching it is navigation, not a data action:
    // the applied filter stays until a new pick replaces it.
    readonly mode = signal<DateMode>('single');
    // The mode the applied value was picked in. The summary reads by it
    // (a one-day value is "a day" from single mode and "a range" from range
    // mode), and reopening returns to it.
    private readonly appliedMode = signal<DateMode>('single');
    // True after a mode switch until the next pick or reopen, so the new
    // mode's calendar starts empty rather than echoing the old value.
    private readonly cleared = signal(false);

    // The first click of a range, held until the second arrives or the popover
    // closes. On close it becomes a single day, so "click one date, dismiss"
    // means that date rather than nothing.
    private pendingFrom: Date | null = null;
    // A start handed to the range calendar by the "วันนี้" button, shown as
    // the open half of a range so the operator picks the end themselves.
    private readonly rangeStart = signal<Date | null>(null);

    private readonly filters = this.dataService.filters;

    constructor() {
        // The popover is positioned against the button once, on open. A pick
        // or a clear changes the header's date line, which can wrap and
        // reflow the rows below it while the popover is still open, and the
        // arrow would keep pointing at where the button used to be. After
        // any render in which the summary changed, the arrow is moved to
        // the button; the popover itself stays where it opened, so the
        // calendar under the pointer does not jump.
        afterRenderEffect(() => {
            this.summary();
            this.pointArrowAtButton();
        });
    }

    // A phone turned sideways keeps the popover open (PrimeNG only closes it
    // on resize for non-touch devices) and does not re-place it.
    @HostListener('window:resize')
    onResize(): void {
        const panel = this.panel();
        if (!panel.overlayVisible) return;
        panel.align();
        this.centerOnPhone();
        this.pointArrowAtButton();
    }

    // Below md the popover sits centred on the screen rather than hanging
    // off the button: the button's place in the wrapped filter row varies,
    // and anchored to it the calendar lands lopsided against one edge.
    // Same breakpoint, and same property, as shared/centered-panel.directive.
    // Only across: keeping it below the button, at every size, is openBelow's.
    private centerOnPhone(): boolean {
        const container = this.panel().container;
        const viewportWidth = window.innerWidth;
        if (!container || viewportWidth >= PHONE_MAX_WIDTH) return false;
        // offsetWidth, not the rect: the open animation's scale() is in the
        // rect and not in the layout width.
        const width = container.offsetWidth;
        if (width <= 0) return false;
        const left = Math.max(0, (viewportWidth - width) / 2);
        container.style.insetInlineStart = `${Math.round(left + window.scrollX)}px`;
        return true;
    }

    // PrimeNG's own arrow placement (the second half of Popover.align()),
    // without the first half that moves the container.
    private pointArrowAtButton(): void {
        const panel = this.panel();
        const container = panel.container;
        const target = panel.target as HTMLElement | null;
        if (!panel.overlayVisible || !container || !target) return;
        const centred = window.innerWidth < PHONE_MAX_WIDTH;
        const c = container.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        // The button has left the popover's span entirely (the row wrapped
        // differently): no arrow offset can reach it, so let the popover
        // follow it after all. Not on a phone, where the popover stays
        // centred whatever the button does.
        if (!centred && (t.left < c.left || t.left > c.right)) {
            panel.align();
            return;
        }
        const radius = parseFloat(getComputedStyle(container).borderRadius) || 0;
        // Kept on the popover's top edge when centred, where the button can
        // sit either side of it.
        const arrowLeft = Math.min(Math.max(0, t.left - c.left - radius * 2), Math.max(0, container.offsetWidth - 3 * 16));
        container.style.setProperty('--p-popover-arrow-left', `${arrowLeft}px`);
    }

    readonly day = computed<Date | null>(() => {
        if (this.cleared()) return null;
        const { dateFrom, dateTo } = this.filters();
        return dateFrom && dateFrom === dateTo ? parseIsoDate(dateFrom) : null;
    });

    readonly range = computed<Date[] | null>(() => {
        const start = this.rangeStart();
        if (start) return [start, null as unknown as Date];
        if (this.cleared()) return null;
        const { dateFrom, dateTo } = this.filters();
        return dateFrom && dateTo ? [parseIsoDate(dateFrom), parseIsoDate(dateTo)] : null;
    });

    readonly days = computed<Date[]>(() => (this.cleared() ? [] : this.filters().dates.map(parseIsoDate)));

    // What the one picker is bound to, in the shape its current mode expects.
    readonly model = computed<Date | Date[] | null>(() => {
        switch (this.mode()) {
            case 'single':
                return this.day();
            case 'multiple':
                return this.days();
            case 'range':
                return this.range();
        }
    });

    // Today as the centre counts it - the same operational day the วันนี้
    // button picks - or this machine's date until the server has said.
    readonly maxDate = computed(() => {
        const iso = this.dataService.context()?.operational_day;
        if (iso) return parseIsoDate(iso);
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });

    readonly hasValue = computed(() => {
        const { dateFrom, dateTo, dates } = this.filters();
        return !!(dateFrom || dateTo || dates.length);
    });

    // The applied dates in words, for the page header - or null when none.
    readonly summary = computed<string | null>(() => {
        const { dateFrom, dateTo, dates } = this.filters();
        if (dates.length) return describeDays(dates.map(parseIsoDate));
        if (dateFrom && dateTo) {
            const from = parseIsoDate(dateFrom);
            const to = parseIsoDate(dateTo);
            // A one-day value reads as a day in single mode and as a range
            // in range mode: the label says what was picked, not what the
            // filter happens to reduce to.
            if (dateFrom === dateTo && this.appliedMode() !== 'range') return formatDay(from);
            // Drop the first year when both halves share it: the button is
            // read at a glance, and "01/09 – 21/09/2569" is one glance.
            const head = from.getFullYear() === to.getFullYear() ? formatDayMonth(from) : formatDay(from);
            return `${head} – ${formatDay(to)}`;
        }
        return null;
    });

    open(event: Event): void {
        // Reopen showing what is applied, in the mode it was picked in. A
        // mode switched to and then abandoned is forgotten; with nothing
        // applied the last mode is kept.
        if (this.hasValue()) this.mode.set(this.appliedMode());
        this.cleared.set(false);
        this.rangeStart.set(null);
        this.panel().toggle(event);
    }

    setMode(mode: DateMode): void {
        if (mode === this.mode()) return;
        this.mode.set(mode);
        this.pendingFrom = null;
        this.rangeStart.set(null);
        this.cleared.set(true);
        // The binding only writes when model() changes, and a half-picked
        // range (held inside the picker, never in the filter) leaves it
        // null before and after - so the picker is told directly. A new mode
        // also starts on the day grid: a mode is a way of picking days, and
        // the month or year view is only a step towards one.
        const picker = this.picker();
        if (picker) {
            picker.writeControlValue(null);
            picker.setCurrentView('date');
        }
    }

    pick(value: Date | Date[] | null): void {
        switch (this.mode()) {
            case 'single':
                this.pickDay(value as Date | null);
                break;
            case 'multiple':
                this.pickDays(value as Date[] | null);
                break;
            case 'range':
                this.pickRange(value as Date[] | null);
                break;
        }
    }

    pickDay(date: Date | null): void {
        this.apply('single');
        this.dataService.setDay(date);
        this.panel().hide();
    }

    // Applied per toggle; the service's 250ms debounce is the only
    // coalescing, same as every other filter on the row.
    pickDays(dates: Date[] | null): void {
        this.apply('multiple');
        this.dataService.setDates(dates);
    }

    pickRange(range: Date[] | null): void {
        const from = range?.[0] ?? null;
        const to = range?.[1] ?? null;
        if (from && !to) {
            this.pendingFrom = from;
            return;
        }
        this.pendingFrom = null;
        this.rangeStart.set(null);
        this.apply('range');
        this.dataService.setDateRange(range);
        this.panel().hide();
    }

    private apply(mode: DateMode): void {
        this.appliedMode.set(mode);
        this.cleared.set(false);
    }

    // Today in whatever mode is showing: the day itself, a one-day range, or
    // added to the set. The server's operational day, not the browser's date,
    // so that after the 08:30 rollover this and the "วันนี้" tab agree.
    pickToday(): void {
        const iso = this.dataService.context()?.operational_day;
        const today = iso ? parseIsoDate(iso) : new Date();
        switch (this.mode()) {
            case 'single':
                this.pickDay(today);
                break;
            // Only the start: the end is the operator's to pick, exactly as
            // if they had clicked today's cell once.
            case 'range':
                this.pendingFrom = today;
                this.rangeStart.set(today);
                break;
            case 'multiple': {
                const current = this.days();
                const key = today.getTime();
                if (!current.some((d) => d.getTime() === key)) this.pickDays([...current, today]);
                break;
            }
        }
    }

    clear(): void {
        this.pendingFrom = null;
        this.rangeStart.set(null);
        this.dataService.setDay(null);
    }

    onShow(): void {
        // Back to the day view, on the month of whatever is applied (or
        // today). A popover closed while drilled into the month or year view
        // must not reopen there - and the size pin below measures the day
        // view, so it has to be the one showing.
        const picker = this.picker();
        if (picker) {
            picker.setCurrentView('date');
            picker.updateUI();
        }
        // p-popover renders its content in place and moves it to <body> when
        // the show animation starts, so the calendar measured itself while
        // squeezed into the filter row. Measure again now that it is where
        // it will stay.
        this.calendar()?.remeasure();
        // After the remeasure, which can change the popover's width.
        if (this.centerOnPhone()) this.pointArrowAtButton();
    }

    onHide(): void {
        this.rangeStart.set(null);
        if (this.pendingFrom) {
            this.apply('range');
            this.dataService.setDateRange([this.pendingFrom, this.pendingFrom]);
            this.pendingFrom = null;
        }
    }
}

function pad(n: number): string {
    return `${n}`.padStart(2, '0');
}

function formatDayMonth(date: Date): string {
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function formatDay(date: Date): string {
    return `${formatDayMonth(date)}/${toBuddhistYear(date)}`;
}

// "1, 4, 28/09/2569" while the picks share a month; past that the list stops
// fitting on a button and the count has to do.
function describeDays(dates: Date[]): string {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const sameMonth = sorted.every((d) => d.getMonth() === first.getMonth() && d.getFullYear() === first.getFullYear());
    if (sameMonth && sorted.length <= 5) {
        return `${sorted.map((d) => d.getDate()).join(', ')}/${pad(first.getMonth() + 1)}/${toBuddhistYear(first)}`;
    }
    return `${sorted.length} วัน`;
}
