import { Directive, afterEveryRender, inject } from '@angular/core';
import { DatePicker } from 'primeng/datepicker';

// p-datepicker greys out the days outside [minDate]/[maxDate] but never its
// own ‹ › arrows, which keep stepping into months, years and decades where
// nothing can be picked - an arrow promising more that leads to a page of
// greyed-out cells, and as many clicks to come back. This stops the arrows
// at the bounds: disabled (PrimeNG's own disabled look) once the view shows
// the month - or in the month and year views, the year or decade - holding
// the bound.
//
// The picker's navBackward/navForward are what both the arrows and keyboard
// navigation across a month's edge call, so it is those that are held, and
// the arrows' disabled state only has to say so.
//
// By selector rather than by attribute: any picker given a bound gets this
// once the directive is imported, with nothing to remember to add.
@Directive({
    selector: 'p-datepicker[minDate], p-datepicker[maxDate]',
    standalone: true
})
export class DatePickerBoundsDirective {
    private readonly picker = inject(DatePicker);

    constructor() {
        // Internal fields of the picker, read as the component itself reads
        // them (PrimeNG 21).
        const picker = this.picker as any;
        const back = picker.navBackward.bind(picker);
        const forward = picker.navForward.bind(picker);
        picker.navBackward = (event?: Event) => {
            if (this.atMin()) return event?.preventDefault();
            back(event);
        };
        picker.navForward = (event?: Event) => {
            if (this.atMax()) return event?.preventDefault();
            forward(event);
        };

        // After every render, because the view (day / month / year) and the
        // month on screen change inside the picker without anything here
        // being told. Cheap: two lookups inside the open panel, none while
        // it is closed.
        afterEveryRender(() => this.syncArrows());
    }

    // Whether stepping back would leave the range: the month shown in the day
    // view, the year in the month view, the decade in the year view.
    private atMin(): boolean {
        const min: Date | null | undefined = this.picker.minDate;
        if (!min) return false;
        const picker = this.picker as any;
        const year: number = picker.currentYear;
        switch (picker.currentView) {
            case 'month':
                return year <= min.getFullYear();
            case 'year':
                return picker.yearPickerValues()[0] <= min.getFullYear();
            default:
                return year < min.getFullYear() || (year === min.getFullYear() && picker.currentMonth <= min.getMonth());
        }
    }

    private atMax(): boolean {
        const max: Date | null | undefined = this.picker.maxDate;
        if (!max) return false;
        const picker = this.picker as any;
        const year: number = picker.currentYear;
        switch (picker.currentView) {
            case 'month':
                return year >= max.getFullYear();
            case 'year':
                return picker.yearPickerValues().at(-1) >= max.getFullYear();
            default:
                return year > max.getFullYear() || (year === max.getFullYear() && picker.currentMonth >= max.getMonth());
        }
    }

    private syncArrows(): void {
        // The panel: in place for an inline picker, in <body> for a popup,
        // and absent while a popup is closed.
        const panel: HTMLElement | undefined = (this.picker as any).contentViewChild?.nativeElement;
        if (!panel) return;
        this.setDisabled(panel.querySelector('.p-datepicker-prev-button'), this.atMin());
        this.setDisabled(panel.querySelector('.p-datepicker-next-button'), this.atMax());
    }

    private setDisabled(button: Element | null, disabled: boolean): void {
        if (!(button instanceof HTMLButtonElement) || button.disabled === disabled) return;
        button.disabled = disabled;
    }
}
