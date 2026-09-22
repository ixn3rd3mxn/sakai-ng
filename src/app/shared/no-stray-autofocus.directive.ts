import { Directive, inject } from '@angular/core';
import { AutoComplete } from 'primeng/autocomplete';
import { DatePicker } from 'primeng/datepicker';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';

// Works around primefaces/primeng#19010 (open; fix PR #19114 unmerged as of
// PrimeNG 21.1): these components declare `autofocus` with no default and pass
// it straight to the pAutoFocus directive, which only strips the native
// attribute when the value is exactly `false`. So every one of them ships as
// `<input autofocus>`.
//
// The browser honours that attribute once per page load, and only when nothing
// is focused at the moment the element appears. A form that opens from a tap
// on a table row (not focusable) right after a refresh meets both conditions:
// the first such element in the form grabbed focus, and a date picker then
// popped its calendar over the form via showOnFocus.
//
// Setting the input to `false` here is what the issue thread settled on; the
// component then removes the attribute itself. Runs in the constructor, so a
// template that binds `[autofocus]="true"` on purpose still wins - Angular
// writes inputs after construction. Import this into any component whose
// template holds these controls; the tag selector applies it to every one.
@Directive({
    selector: 'p-select, p-autocomplete, p-datepicker, p-inputnumber',
    standalone: true
})
export class NoStrayAutofocusDirective {
    constructor() {
        const host =
            inject(Select, { self: true, optional: true }) ??
            inject(AutoComplete, { self: true, optional: true }) ??
            inject(DatePicker, { self: true, optional: true }) ??
            inject(InputNumber, { self: true, optional: true });
        if (host && host.autofocus === undefined) host.autofocus = false;
    }
}
