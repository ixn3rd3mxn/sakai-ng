import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { DatePicker } from 'primeng/datepicker';
import { Select } from 'primeng/select';

// Horizontal placement for a body-appended popup that is wider than the field
// it belongs to. Opt in with the `centeredPanel` attribute on a p-datepicker
// or a p-select; used by the dialogs on /report/dashboard (สลับวันเวลา's day
// picker, บันทึกข้อมูล's CBD and severity dropdowns) and /report/summary.
//
// PrimeNG anchors a body-appended popup to the field's left edge (or, when
// that would overflow the viewport, to its right edge). That reads fine when
// the field is the wider of the two. In these dialogs it is not: the day grid
// is ~300px under a short input column, and a select's options are nowrap,
// so the CBD list grows to its longest name - well past a dialog that is 67vw
// on a phone. Either way the popup lands lopsided, hanging off one side of
// the dialog. Instead:
//
//   below md (768px)   centred on the viewport - the dialog itself is
//                      centred and nearly as wide as the screen, so this is
//                      also "centred on the dialog"
//   from md            centred under the field, clamped to the viewport
//
// (A select's popup takes the second rule at every size - see below, it is
// the field's own width, so centring it on the screen would pull it off the
// field.)
//
// Only the horizontal position is touched; PrimeNG still decides top,
// including flipping above the field when there is no room below.
//
// A select's list can also be wider than the phone screen outright (the CBD
// list is ~410px), and no horizontal position fixes that. A select's popup
// is therefore sized here too, at every screen size: exactly the field's
// width, sitting flush under it like a native dropdown. Options that do not
// fit are cut with an ellipsis by layout/_utils.scss. Only selects: the day
// grid is a fixed 7-column table that fits any phone as it is.
//
// That width has to be capped from the moment the list exists, not just on
// show - see `centered-panel-select` in ngAfterViewInit. PrimeNG appends the
// list to body at its natural width and only then measures the field to
// position it. For the instant in between, a 410px list on a 390px phone
// overflows the page sideways, and a mobile browser answers that by zooming
// the page out to fit. The centred dialog drops by half the difference,
// PrimeNG measures the field down there, and writes a top that is 20-30px
// too low; then the width is capped, the zoom snaps back, the dialog moves
// up - and the list stays put, floating well below its field. Seen on every
// phone narrower than the list (iPhone SE/14/15/16) and on none wider (XR).
//
// Done from a directive rather than CSS because the popup lives in body, so
// a stylesheet cannot know where the field is. It hooks onShow, the moment
// PrimeNG has just positioned the popup and before it has painted.
//
// The two components hand different elements to onShow, and neither is quite
// the one to move:
//
//   p-datepicker   the <p-motion> wrapper. That *is* the positioned element
//                  (position: absolute, top, inset-inline-start, all inline);
//                  the .p-datepicker-panel inside it is static.
//   p-select       a motion event whose .element is again the <p-motion>, but
//                  here it sits inside p-overlay's root div, and that div is
//                  what p-overlay positions. So: the wrapper's parent.
@Directive({
    selector: 'p-datepicker[centeredPanel], p-select[centeredPanel]',
    standalone: true
})
export class CenteredPanelDirective implements AfterViewInit, OnDestroy {
    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly datePicker = inject(DatePicker, { self: true, optional: true });
    private readonly select = inject(Select, { self: true, optional: true });

    private readonly subscription = new Subscription();
    private styleObserver: MutationObserver | null = null;
    private panel: HTMLElement | null = null;

    // Tailwind's md in this project (assets/tailwind.css). Everything narrower
    // is treated as a phone.
    private static readonly PHONE_MAX_WIDTH = 768;

    // The least a select's popup keeps clear of each screen edge - 1rem at
    // the 16px root size. Only reachable if the field itself runs nearly
    // edge to edge.
    private static readonly GUTTER = 16;

    private readonly onResize = () => this.center();

    ngAfterViewInit(): void {
        if (this.datePicker) {
            this.subscription.add(this.datePicker.onShow.subscribe((panel: HTMLElement) => this.onPanelShow(panel)));
            this.subscription.add(this.datePicker.onClose.subscribe(() => this.disconnect()));
        } else if (this.select) {
            // Onto the list itself via panelStyleClass, so the cap in
            // layout/_utils.scss is in force before PrimeNG measures anything
            // - the `centered-panel` class this adds on show is too late for
            // that (see the note on zoom-out above). Appended, in case the
            // template set a class of its own.
            this.select.panelStyleClass = [this.select.panelStyleClass, 'centered-panel-select'].filter(Boolean).join(' ');
            this.subscription.add(
                this.select.onShow.subscribe((event: { element?: HTMLElement }) => {
                    const positioned = event?.element?.parentElement;
                    if (positioned) this.onPanelShow(positioned);
                })
            );
            this.subscription.add(this.select.onHide.subscribe(() => this.disconnect()));
        }
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
        this.disconnect();
    }

    private onPanelShow(panel: HTMLElement): void {
        this.panel = panel;
        panel.classList.add('centered-panel');
        this.center();

        // PrimeNG re-runs its own alignment after the fact - the date picker
        // on every header -> month -> year switch, the select a tick after
        // its options change - writing the anchored position back over ours.
        // Watching the style attribute catches each of those and re-centres
        // before the next paint. Our own write fires the observer once more,
        // but by then the value already matches and center() leaves it alone.
        this.styleObserver = new MutationObserver(() => this.center());
        this.styleObserver.observe(panel, { attributes: true, attributeFilter: ['style'] });

        // PrimeNG closes the popup on resize on non-touch devices, but on a
        // phone an orientation change leaves it open in its old place.
        window.addEventListener('resize', this.onResize);
    }

    private disconnect(): void {
        this.styleObserver?.disconnect();
        this.styleObserver = null;
        window.removeEventListener('resize', this.onResize);
        // The date picker reuses its popup element across opens; the select
        // destroys and recreates its own, so this is only load-bearing for
        // the former.
        this.panel?.classList.remove('centered-panel');
        this.panel = null;
    }

    // What the popup is centred under from md up. The date picker's visible
    // box is its <input>; a select's is the host element itself (its input is
    // a hidden focus target).
    private fieldRect(): DOMRect {
        const el = this.datePicker ? this.host.nativeElement.querySelector('input') : null;
        return (el ?? this.host.nativeElement).getBoundingClientRect();
    }

    private center(): void {
        const panel = this.panel;
        if (!panel) return;

        const viewportWidth = window.innerWidth;
        if (viewportWidth <= 0) return;
        const phone = viewportWidth < CenteredPanelDirective.PHONE_MAX_WIDTH;
        const rect = this.fieldRect();

        // Width first, then position, since the position depends on it.
        // Written on the same element PrimeNG puts min-width on; the select's
        // own overlay div fills whatever width this one has.
        if (this.select) {
            panel.style.width = `${Math.round(Math.min(rect.width, viewportWidth - 2 * CenteredPanelDirective.GUTTER))}px`;
        }

        // offsetWidth, not getBoundingClientRect().width: the open animation
        // runs a scale() on the popup, which the rect includes and layout
        // width does not.
        const width = panel.offsetWidth;
        if (width <= 0) return;

        // A select's popup is the field's width, so "centred under the field"
        // is simply "under the field" - at every size, or on a phone it would
        // drift off the field whenever the dialog is not dead centre.
        let left: number;
        if (phone && !this.select) {
            left = (viewportWidth - width) / 2;
        } else {
            left = rect.left + rect.width / 2 - width / 2;
        }
        left = Math.max(0, Math.min(left, viewportWidth - width));

        // inset-inline-start, matching the property PrimeNG writes, so this
        // replaces its value rather than adding a competing `left`. The popup
        // is positioned against the document, so the scroll offset goes in
        // the same way PrimeNG's own calculation adds it.
        const value = `${Math.round(left + window.scrollX)}px`;
        if (panel.style.insetInlineStart !== value) panel.style.insetInlineStart = value;
    }
}
