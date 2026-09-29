import { Component, OnInit, inject, viewChild } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { DatePicker, DatePickerModule } from 'primeng/datepicker';
import { AutoFocusModule } from 'primeng/autofocus';
import { SelectButtonModule } from 'primeng/selectbutton';
import { IncidentHistoryDataService } from '../services/incident-history-data.service';
import { BuddhistYearDirective } from '../../../shared/buddhist-year.directive';
import { DatePickerBoundsDirective } from '../../../shared/datepicker-bounds.directive';
import { formatBuddhistDay } from '../../dashboardclone/services/date-utils';

type DateMode = 'single' | 'multiple' | 'range';

// Trimmed version of dashboardclone's dispatch-action-dial: same
// SpeedDial + Buddhist-era date picker pattern, but only a date (no shift,
// since every stat table on this page already merges all three shifts).
@Component({
    standalone: true,
    selector: 'app-incident-history-date-dial',
    imports: [SpeedDialModule, DialogModule, ButtonModule, FormsModule, DatePickerModule, SelectButtonModule, BuddhistYearDirective, DatePickerBoundsDirective, AutoFocusModule],
    template: `
    <!-- Sized like dispatch-action-dial's dial: a 50px trigger with a 20px
         glyph, 44px actions. Trigger through [buttonStyle], not [style] -
         [style] is the root wrapper that also holds the fan, and sizing that
         squashes the button. -->
    <p-speeddial
        [model]="items"
        direction="up"
        showIcon="pi pi-bars"
        hideIcon="pi pi-times"
        [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10 }"
        [buttonStyle]="{ width: '50px', height: '50px' }"
        [tooltipOptions]="{ tooltipPosition: 'left' }"
    />

    <!-- No width: the inline calendar decides it, as the day grid does in
         the flood intake's วันที่ popover. maxWidth still keeps it inside a
         narrow phone. -->
    <p-dialog header="สลับวัน" [focusOnShow]="false" [(visible)]="displayDatePicker" [style]="{ maxWidth: '92vw' }" [modal]="true" (onShow)="onShow()">
        <div class="flex flex-col gap-3">
            <!-- The same three modes, in the same order, as the วันที่ filter
                 on /flood/intake. หลายวัน and ช่วงวันที่ switch the page to its
                 several-days view (see the page's isRange). -->
            <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [ngModel]="mode" (ngModelChange)="setMode($event)" [allowEmpty]="false" size="small" />
            <div class="flex flex-col gap-1">
                <!-- Always open, like the flood intake's วันที่ popover: one
                     click on a day instead of opening a popup first. -->
                <p-datepicker buddhistYear inline [selectionMode]="mode" [(ngModel)]="tempValue" [minDate]="minDate" [maxDate]="maxDate" />
                @if (mode === 'range') {
                    <!-- Most requests from outside the shift are one of these;
                         clicking through three months of calendar is not.
                         Under the calendar they fill; ยืนยัน applies as
                         usual. -->
                    <div class="flex flex-wrap gap-1 mt-1">
                        <!-- The last one takes whatever the row has left, so the
                             row ends flush with the calendar's edge. -->
                        @for (preset of presets; track preset.label; let last = $last) {
                            <p-button
                                [label]="preset.label"
                                size="small"
                                severity="secondary"
                                [outlined]="true"
                                [fluid]="last"
                                [style.flex]="last ? '1 1 auto' : null"
                                (onClick)="applyPreset(preset.range())"
                            />
                        }
                    </div>
                }
            </div>
        </div>
        <ng-template #footer>
            <!-- The pair that changes the pick on the left, the pair that
                 closes the dialog on the right - the same footer as the other
                 สลับวัน. Neither on the left applies anything; ยืนยัน does. -->
            <span class="mr-auto flex gap-2">
                <p-button label="ล้าง" [text]="true" (click)="clearPick()" />
                <p-button label="วันนี้" [text]="true" (click)="pickToday()" />
            </span>
            <p-button label="ยกเลิก" severity="secondary" (click)="displayDatePicker = false" />
            <p-button label="ยืนยัน" (click)="confirmDate()" />
        </ng-template>
    </p-dialog>`,
    styles: `
        /* Same rules as dispatch-action-dial, which explains each declaration:
           the actions get no size from SpeedDial's stylesheet, so width alone
           leaves Button's padding setting the height and the circle draws as
           an ellipse. */
        :host ::ng-deep .p-speeddial-action.p-button {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border-radius: 50%;
        }

        :host ::ng-deep .p-speeddial-action .p-speeddial-action-icon,
        :host ::ng-deep .p-speeddial-action .p-button-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            line-height: 18px;
        }

        :host ::ng-deep .p-speeddial-button .p-button-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            line-height: 20px;
        }

        /* Trigger rotation on open. PrimeNG's own p-speeddial-rotate does this
           for the default + icon but switches itself off once hideIcon is set,
           so the bars/times pair gets it back here: the icon swap is instant
           and the quarter turn is what makes it read as one motion. The
           transition list is Button's own plus transform - a bare transform
           transition would drop the hover colour fades. */
        :host ::ng-deep .p-speeddial-button {
            transition:
                transform 250ms cubic-bezier(0.4, 0, 0.2, 1),
                background var(--p-button-transition-duration),
                color var(--p-button-transition-duration),
                border-color var(--p-button-transition-duration),
                box-shadow var(--p-button-transition-duration),
                outline-color var(--p-button-transition-duration);
        }

        :host ::ng-deep .p-speeddial-open .p-speeddial-button {
            transform: rotate(90deg);
        }
    `,
    // MessageService comes from IncidentHistoryComponent, which owns the
    // <p-toast /> - its header refresh button and top-days list report
    // through it too.
})
export class IncidentHistoryDateDial implements OnInit {
    private messageService = inject(MessageService);
    private dataService = inject(IncidentHistoryDataService);
    private readonly picker = viewChild(DatePicker);
    private readonly calendar = viewChild(BuddhistYearDirective);

    items: MenuItem[] | null = null;

    displayDatePicker: boolean = false;
    minDate: Date | undefined;
    maxDate: Date | undefined;

    readonly modes: { label: string; value: DateMode }[] = [
        { label: 'วันเดียว', value: 'single' },
        { label: 'หลายวัน', value: 'multiple' },
        { label: 'ช่วงวันที่', value: 'range' }
    ];
    mode: DateMode = 'single';
    // In the shape the picker's mode expects: a Date, a Date[], or [from, to].
    tempValue: Date | Date[] | null = null;

    // Each ends today and starts no earlier than the first day with data.
    readonly presets: { label: string; range: () => [Date, Date] }[] = [
        { label: 'เดือนนี้', range: () => this.monthsBack(0) },
        { label: 'เดือนที่แล้ว', range: () => this.lastMonth() },
        { label: '3 เดือนล่าสุด', range: () => this.monthsBack(2) },
        { label: 'ปีนี้', range: () => this.clamp(new Date(this.today().getFullYear(), 0, 1), this.today()) }
    ];

    // Buddhist-era rendering (and keeping the popup one size across its
    // day/month/year views) lives in BuddhistYearDirective - see the
    // `buddhistYear` attribute on the picker above.

    // Opens on what is on screen, in the mode it was picked in. Nothing past
    // today can be picked: those days have no incidents yet, and would only
    // count as empty.
    openDatePicker() {
        this.maxDate = this.today();
        const range = this.dataService.rangeSelection();
        if (range?.kind === 'range') {
            this.mode = 'range';
            this.tempValue = [range.from, range.to];
        } else if (range?.kind === 'days') {
            this.mode = 'multiple';
            this.tempValue = [...range.dates];
        } else {
            this.mode = 'single';
            this.tempValue = this.dataService.selectedDate();
        }
        this.displayDatePicker = true;
    }

    // As the flood intake's วันที่ filter does it (flood-date-filter.ts).
    setMode(mode: DateMode) {
        if (mode === this.mode) return;
        this.mode = mode;
        // Each mode keeps its value in a different shape; carrying one across
        // would hand the picker the wrong one.
        this.tempValue = null;
        // A half-picked range lives inside the picker, not in tempValue, so
        // the picker is cleared directly. A new mode also starts on the day
        // grid: a mode is a way of picking days, and the month or year view
        // is only a step towards one.
        const picker = this.picker();
        if (picker) {
            picker.writeControlValue(null);
            picker.setCurrentView('date');
        }
    }

    // Back to the day grid on the month of the value, every time the dialog
    // opens: one closed while drilled into the month or year view must not
    // reopen there. Then re-measured, now that the calendar is laid out in
    // the dialog (see BuddhistYearDirective.remeasure).
    onShow() {
        const picker = this.picker();
        if (picker) {
            picker.setCurrentView('date');
            picker.updateUI();
        }
        this.calendar()?.remeasure();
    }


    // As the flood intake's วันที่ filter: one day picks today; several days
    // adds it; a range starts on it and leaves the end to be picked.
    pickToday() {
        const today = this.today();
        const value = this.tempValue;
        if (this.mode === 'single') {
            this.tempValue = today;
        } else if (this.mode === 'multiple') {
            const days = Array.isArray(value) ? value.filter((d): d is Date => !!d) : [];
            if (!days.some((d) => d.getTime() === today.getTime())) this.tempValue = [...days, today];
        } else {
            this.tempValue = [today, null as unknown as Date];
        }
        this.picker()?.setCurrentView('date');
    }

    clearPick() {
        this.tempValue = null;
        // A half-picked range is held inside the picker; clear it there too.
        this.picker()?.writeControlValue(null);
    }

    applyPreset([from, to]: [Date, Date]) {
        this.tempValue = [from, to];
        // A preset is days; show them on the day grid, whatever view the
        // calendar was left in.
        this.picker()?.setCurrentView('date');
    }

    confirmDate() {
        const value = this.tempValue;
        const days = Array.isArray(value) ? value.filter((d): d is Date => !!d) : value ? [value] : [];
        if (!days.length) {
            this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดเลือกวันที่' });
            return;
        }

        const fmt = formatBuddhistDay;
        let detail: string;
        if (this.mode === 'range') {
            // A range with only its start picked means that one day.
            const [from, to = from] = days;
            this.dataService.selectRange({ kind: 'range', from, to });
            detail = `เลือกช่วง: ${fmt(from)} – ${fmt(to)}`;
        } else if (this.mode === 'multiple') {
            const sorted = [...days].sort((a, b) => a.getTime() - b.getTime());
            this.dataService.selectRange({ kind: 'days', dates: sorted });
            detail = sorted.length === 1 ? `เลือกวัน: ${fmt(sorted[0])}` : `เลือก ${sorted.length} วัน`;
        } else {
            this.dataService.select(days[0]);
            detail = `เลือกวัน: ${fmt(days[0])}`;
        }
        this.messageService.add({ severity: 'success', summary: 'สลับวัน', detail });
        this.displayDatePicker = false;
    }

    // The dispatch centre's operational day, not this machine's date - the
    // same "today" as the flood intake's วันที่ filter uses.
    private today(): Date {
        return this.dataService.currentOperationalDay();
    }

    private clamp(from: Date, to: Date): [Date, Date] {
        return [this.minDate && from < this.minDate ? this.minDate : from, to];
    }

    // The 1st of the month `back` months ago, to today.
    private monthsBack(back: number): [Date, Date] {
        const today = this.today();
        return this.clamp(new Date(today.getFullYear(), today.getMonth() - back, 1), today);
    }

    private lastMonth(): [Date, Date] {
        const today = this.today();
        return this.clamp(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0));
    }

    resetDate() {
        this.dataService.selectCurrent();
        this.messageService.add({ severity: 'success', summary: 'วันปัจจุบัน', detail: 'กำลังดูข้อมูลวันนี้' });
    }

    ngOnInit() {
        this.minDate = new Date(2026, 7, 1);
        // Moved up to today each time the dialog opens (openDatePicker).
        this.maxDate = this.today();

        this.items = [
            {
                label: 'สลับวัน',
                icon: 'pi pi-calendar',
                command: () => {
                    this.openDatePicker();
                }
            },
            {
                label: 'วันปัจจุบัน',
                icon: 'pi pi-refresh',
                command: () => {
                    this.resetDate();
                }
            }
        ];
    }
}
