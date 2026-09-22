import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { DatePicker } from 'primeng/datepicker';
import { BUDDHIST_ERA_OFFSET } from '../pages/dashboardclone/services/date-utils';

// Presentation fixes for p-datepicker, shared by every picker in the app.
//
// Thai month and day names already come from the global PrimeNG translation in
// app.config.ts. The year does not: p-datepicker formats it straight off
// `Date.getFullYear()`, with no template hook and no calendar setting, so a
// Thai operator reads "2026" where every other document at the centre says
// 2569.
//
// Two places show a year and both have to be patched: the text in the input,
// and the year captions inside the popup (header button, year grid, decade
// range). The bound Date stays Gregorian throughout - only what is rendered
// changes - so selection, min/max and everything sent to the backend are
// untouched.
//
// Packaged as a directive rather than copied into each component. This logic
// previously existed as three near-identical ~90-line copies (dispatch-action-
// dial, incident-history-date-dial, and this feature), which is exactly why the
// panel-width bug below went unnoticed in all three at once. One copy now, and
// every picker opts in with a single `buddhistYear` attribute.

// PrimeNG sizes the popup from whatever view happens to be showing:
//
//     .p-datepicker .p-datepicker-panel { min-width: 100%; }  /* of the input */
//     .p-datepicker-day-view  { width: 100% }   -- a <table>, so its seven
//                                                 columns give it a real
//                                                 intrinsic width
//     .p-datepicker-month     { width: 33.3% }  -- plain divs; a percentage
//     .p-datepicker-year      { width: 50%   }     contributes no intrinsic
//                                                 width at all
//
// The day grid is therefore the only view that decides a width, and the popup
// visibly resizes as you click header -> month -> year. Which way it jumps
// depends on where the panel lives:
//
//   inline (the table's date filter)  month/year collapse to the input's
//                                     width - 154px against a 268px day grid
//   appendTo="body" (the drawer)      the `min-width: 100%` rule cannot match
//                                     any more, so `width: auto` lets the
//                                     month grid balloon to 442px instead
//
// Height has the same problem in the other direction: the month view is
// four rows of padded text and the year view five, so the popup (or the
// popover holding an inline one) changes height as the operator drills from
// day to month to year.
//
// So the month and year views are held to the day grid's size and the panel
// is left to size itself around them. Rather than hard-code a number - the
// day grid's width comes from theme tokens, and this app's root font is
// 14px, not the 16px a rem value would suggest - the day view is measured
// whenever it is on screen, and the month and year views are laid out as
// grids of exactly that width and height. The day grid itself is left alone:
// it is five rows for most months and six for some, and growing with the
// month is PrimeNG's own behaviour and reads naturally.

// Matches the year in "dd/mm/yyyy", including both halves of the range form
// "dd/mm/yyyy - dd/mm/yyyy" that the table's filter produces.
const DATE_YEAR = /(\d{1,2}\/\d{1,2}\/)(\d{4})/g;

// Anything at or above this is already Buddhist. Converting only below it makes
// every patch idempotent, so a value that gets written back through the setter
// a second time cannot become 3112 - the failure the other two copies avoid
// only by assuming PrimeNG always writes a fresh Gregorian string.
const ALREADY_BUDDHIST = 2400;

function toBuddhist(year: number): number {
    return year < ALREADY_BUDDHIST ? year + BUDDHIST_ERA_OFFSET : year;
}

/** Shift the year(s) in a formatted date string; anything else passes through. */
export function shiftDatesToBuddhist(raw: string): string {
    if (!raw) return raw;
    return raw.replace(DATE_YEAR, (_match, prefix: string, year: string) => prefix + toBuddhist(Number(year)));
}

@Directive({
    selector: 'p-datepicker[buddhistYear]',
    standalone: true
})
export class BuddhistYearDirective implements AfterViewInit, OnDestroy {
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly picker = inject(DatePicker, { self: true });

    private readonly subscription = new Subscription();
    private panelObserver: MutationObserver | null = null;
    private panel: HTMLElement | null = null;
    // The day grid's size, which the month and year views are held to.
    // Refreshed every time the day grid is on screen, so drilling in from a
    // six-row month gives a month view as tall as that month was.
    private viewWidth = 0;
    private viewHeight = 0;

    // Remembers the exact text last written to each node, so a rescan caused by
    // an unrelated mutation (switching to month view leaves the header year
    // alone) can tell "already patched" from "genuinely new" text.
    private readonly patched = new WeakMap<Text, string>();

    private static readonly YEAR_SELECTOR = '.p-datepicker-select-year, .p-datepicker-year-view .p-datepicker-year';
    private static readonly DECADE_SELECTOR = '.p-datepicker-decade';
    // The selected year cell carries a visually hidden aria-live region
    // holding the same year again. Left alone it would announce "2026" while
    // the cell beside it reads 2569 - so a screen-reader user gets a different
    // answer than a sighted one.
    private static readonly ANNOUNCED_YEAR_SELECTOR =
        '.p-datepicker-year > .p-hidden-accessible, .p-datepicker-select-year > .p-hidden-accessible';

    ngAfterViewInit(): void {
        this.patchInput();
        // An inline picker has no input and never opens: its panel is simply
        // there, so it is patched once on init and watched for the lifetime
        // of the directive (the date filter's popover recreates it per open).
        if (this.picker.inline) {
            const panel = this.host.nativeElement.querySelector('.p-datepicker-panel') as HTMLElement | null;
            // Inside a popover the panel exists before it is laid out, and an
            // unlaid panel measures 0 x 0; wait a frame or two for it. (An
            // overlay that renders in place and moves later still needs
            // `remeasure()` once it has settled - see there.)
            if (panel) this.whenMeasurable(panel, () => this.onPanelShow(panel));
            return;
        }
        this.subscription.add(this.picker.onShow.subscribe((panel: HTMLElement) => this.onPanelShow(panel)));
        this.subscription.add(this.picker.onClose.subscribe(() => this.disconnect()));
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
        this.disconnect();
    }

    // Change detection is zoneless, so there is no dependable "after PrimeNG
    // wrote the Gregorian text" moment to hook - it can rewrite the value (on
    // focus, on selection, on clear) with nothing to re-trigger a lifecycle
    // callback. Intercepting the property on this one input catches every
    // write at the source instead, whatever the timing.
    private patchInput(): void {
        const input = this.host.nativeElement.querySelector('input');
        if (!input || (input as any).__buddhistYearPatched) return;
        (input as any).__buddhistYearPatched = true;

        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(input, 'value', {
            configurable: true,
            enumerable: true,
            get(): string {
                return native.get!.call(input);
            },
            set(raw: string): void {
                native.set!.call(input, shiftDatesToBuddhist(raw));
            }
        });

        // Re-run the setter over whatever is already there; harmless if the
        // field is still empty, and idempotent if it somehow already reads BE.
        input.value = native.get!.call(input);
    }

    private onPanelShow(panel: HTMLElement): void {
        this.panel = panel;
        this.measureViews(panel);
        this.panelObserver = new MutationObserver(() => this.patchPanel(panel));
        this.patchPanel(panel);
    }

    /**
     * Measure again, from scratch. For an inline picker inside an overlay
     * that first renders where it is declared and is appended to <body> and
     * aligned only when its show animation starts (p-popover does this): the
     * size taken in ngAfterViewInit is of the panel squeezed into whatever
     * row it was declared in, so the overlay's onShow calls this once it has
     * settled in its real place.
     */
    remeasure(): void {
        const panel = this.panel;
        if (!panel) return;
        this.measureViews(panel);
        this.patchPanel(panel);
    }

    private whenMeasurable(panel: HTMLElement, then: () => void, attempts = 10): void {
        if (panel.offsetWidth > 0 || attempts === 0) {
            then();
            return;
        }
        requestAnimationFrame(() => this.whenMeasurable(panel, then, attempts - 1));
    }

    // Take the day grid's size, when it is on screen. Nothing is written to
    // the panel itself: it keeps sizing itself around its content.
    private measureViews(panel: HTMLElement): void {
        const dayView = panel.querySelector('.p-datepicker-day-view') as HTMLElement | null;
        if (!dayView) return;
        // offsetWidth, not getBoundingClientRect().width: the open animation
        // applies a transform, which the rect includes and layout width does
        // not - measuring mid-animation would take a scaled-down width.
        const width = dayView.offsetWidth;
        const height = dayView.offsetHeight;
        if (width <= 0 || height <= 0) return;
        this.viewWidth = width;
        this.viewHeight = height;
    }

    // Hold the month and year views - rows of inline-flex boxes that would
    // otherwise take whatever width and height their padding gives them - to
    // the day grid's size, as grids, so their rows share it evenly. Set on
    // the element rather than in a stylesheet because the view is recreated
    // on every switch, the panel may live under <body>, and this directive
    // has no styles of its own to scope to it.
    private fitViews(panel: HTMLElement): void {
        this.measureViews(panel);
        if (!this.viewWidth || !this.viewHeight) return;

        const grids: [string, string, number][] = [
            ['.p-datepicker-month-view', '.p-datepicker-month', 3],
            ['.p-datepicker-year-view', '.p-datepicker-year', 2]
        ];
        for (const [viewSelector, cellSelector, columns] of grids) {
            const view = panel.querySelector(viewSelector) as HTMLElement | null;
            if (!view) continue;
            view.style.display = 'grid';
            view.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
            view.style.width = `${this.viewWidth}px`;
            view.style.height = `${this.viewHeight}px`;
            view.querySelectorAll<HTMLElement>(cellSelector).forEach((cell) => (cell.style.width = 'auto'));
        }
    }

    private disconnect(): void {
        this.panelObserver?.disconnect();
        this.panelObserver = null;
        this.panel = null;
        this.viewWidth = 0;
        this.viewHeight = 0;
    }

    private patchPanel(panel: HTMLElement): void {
        // Detached while rewriting, or each write would re-enter the observer.
        this.panelObserver?.disconnect();

        this.fitViews(panel);

        panel.querySelectorAll<HTMLElement>(BuddhistYearDirective.YEAR_SELECTOR).forEach((node) => {
            this.patchTextNode(node, (raw) => (/^\d{4}$/.test(raw) ? String(toBuddhist(Number(raw))) : null));
        });

        panel.querySelectorAll<HTMLElement>(BuddhistYearDirective.ANNOUNCED_YEAR_SELECTOR).forEach((node) => {
            this.patchTextNode(node, (raw) => (/^\d{4}$/.test(raw) ? String(toBuddhist(Number(raw))) : null));
        });

        // Decade header, e.g. "2020 - 2029".
        panel.querySelectorAll<HTMLElement>(BuddhistYearDirective.DECADE_SELECTOR).forEach((node) => {
            this.patchTextNode(node, (raw) =>
                /^\s*\d{4}\s*-\s*\d{4}\s*$/.test(raw) ? raw.replace(/\d{4}/g, (y) => String(toBuddhist(Number(y)))) : null
            );
        });

        this.panelObserver?.observe(panel, { childList: true, characterData: true, subtree: true });
    }

    private patchTextNode(host: HTMLElement, convert: (raw: string) => string | null): void {
        const textNode = Array.from(host.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
        const raw = textNode?.textContent;
        if (!textNode || !raw) return;

        const trimmed = raw.trim();
        if (this.patched.get(textNode) === raw) return;

        const shifted = convert(trimmed);
        if (shifted === null || shifted === trimmed) return;

        textNode.textContent = shifted;
        this.patched.set(textNode, shifted);
    }
}
