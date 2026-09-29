import { AfterViewInit, Directive, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { AutoComplete } from 'primeng/autocomplete';
import { DatePicker } from 'primeng/datepicker';
import { Overlay } from 'primeng/overlay';
import { Popover } from 'primeng/popover';
import { Select } from 'primeng/select';

// The popup of a select, an autocomplete, a date picker or a popover always
// opens below its field (a popover: below the button that opened it). Opt in
// with the `openBelow` attribute. Used on /flood/intake: every dropdown and
// popover on the case table's card, and every dropdown in the case drawer.
//
// PrimeNG opens the popup below the field, and flips it above when it would
// run past the bottom of the screen. If it does not fit above either - a
// phone in landscape is short enough for that to happen to nearly any field
// - it pins the popup to the top of the screen, so it runs down over the
// field itself and hides the value, the clear icon and the label.
//
// Below, a popup can still run past the bottom of the screen, or down over
// the drawer's action bar. So on open the field's scroll container - the
// drawer's body, or the page - is scrolled up by just enough to show all of
// it above that bar (or the bottom of the screen), as far as the field can
// go without passing under the top of that container (or the page's fixed
// topbar).
//
// And it stays open while that container scrolls, following its field, the
// way a list on the page does. PrimeNG closes a popup when a scrollable
// ancestor of its field scrolls - the drawer's body, never the page - since
// a body-appended popup would otherwise be left where the field was. Here it
// is moved with the field instead, so scrolling the drawer to see the rest
// of a list, or to look at the form around it, keeps it open - as long as
// the field stays wholly in view. Once any of it is scrolled out of view -
// past the drawer body's edge, behind its action bar, or under the page's
// topbar - the popup closes: it hangs from the field's bottom edge, so it
// would come apart from what is left of the field. Closed rather than
// hidden until the field returns: a hidden
// list still holds focus in its search box, so typing would go somewhere
// unseen and a phone would keep its keyboard up.
//
// Done after PrimeNG's own placement rather than in place of it. A select or
// an autocomplete is placed by its p-overlay, which emits onBeforeEnter just
// after it has positioned the popup and before it paints; a date picker
// hands its positioned element to onShow at the same point, and a popover
// emits onShow once it has aligned its container. PrimeNG places
// the popup again later - when the filter or the suggestions change the
// list, on every header -> month -> year switch - so a style observer puts
// it back below each time, before the next paint.
@Directive({
    selector: 'p-select[openBelow], p-autocomplete[openBelow], p-datepicker[openBelow], p-popover[openBelow]',
    standalone: true
})
export class OpenBelowDirective implements AfterViewInit, OnDestroy {
    private readonly select = inject(Select, { self: true, optional: true });
    private readonly autoComplete = inject(AutoComplete, { self: true, optional: true });
    private readonly datePicker = inject(DatePicker, { self: true, optional: true });
    private readonly popover = inject(Popover, { self: true, optional: true });

    private readonly subscription = new Subscription();
    private styleObserver: MutationObserver | null = null;
    private panel: HTMLElement | null = null;
    private target: HTMLElement | null = null;
    // The field's scroll container while the popup is open (null: the page).
    private container: HTMLElement | null = null;

    // Any scroll that moves the field - the drawer's body, or the page -
    // moves the popup with it. Scroll events do not bubble, so this listens
    // in the capture phase on the document; a scroll inside the popup itself
    // (its own list) does not move the field and is ignored.
    private readonly onScroll = (event: Event): void => {
        const scrolled = event.target;
        if (!this.target || !(scrolled instanceof Node) || !scrolled.contains(this.target)) return;
        this.place();
        this.closeOnceFieldOutOfView();
    };

    // The least room left between the popup and the bottom of the screen,
    // and between the field and whatever it is scrolled up to.
    private static readonly MARGIN = 8;

    ngAfterViewInit(): void {
        const overlay: Overlay | null | undefined = (this.select ?? this.autoComplete)?.overlayViewChild;
        if (overlay) {
            // p-overlay asks this hook whether each close trigger counts. A
            // scroll never does (see onScroll); everything else is passed
            // through as p-overlay would have decided it. Through the hook
            // rather than by unbinding: p-overlay binds its scroll listener
            // when the open animation ends, which is after onBeforeEnter.
            const own = overlay.listener;
            overlay.listener = (event: Event, options: { type: string; valid: boolean }) => {
                if (options.type === 'scroll') return false;
                return own ? own(event, options) : options.valid;
            };
            this.subscription.add(
                overlay.onBeforeEnter.subscribe(() => {
                    const panel = overlay.overlayViewChild?.nativeElement as HTMLElement | undefined;
                    const target = overlay.targetEl as HTMLElement | undefined;
                    if (panel && target) this.onPanelShow(panel, target);
                })
            );
            this.subscription.add(overlay.onAfterLeave.subscribe(() => this.disconnect()));
        } else if (this.datePicker) {
            const picker = this.datePicker;
            this.subscription.add(
                picker.onShow.subscribe((panel: HTMLElement) => {
                    const target = picker.inputfieldViewChild?.nativeElement as HTMLElement | undefined;
                    if (panel && target) this.onPanelShow(panel, target);
                })
            );
            this.subscription.add(picker.onClose.subscribe(() => this.disconnect()));
        } else if (this.popover) {
            const popover = this.popover;
            this.subscription.add(
                popover.onShow.subscribe(() => {
                    const target = popover.target as HTMLElement | null;
                    if (popover.container && target) this.onPanelShow(popover.container, target);
                })
            );
            this.subscription.add(popover.onHide.subscribe(() => this.disconnect()));
        }
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
        this.disconnect();
    }

    private onPanelShow(panel: HTMLElement, target: HTMLElement): void {
        this.disconnect();
        this.panel = panel;
        this.target = target;
        this.container = scrollParent(target);
        // A date picker and a popover bind their close-on-scroll just before
        // onShow and have no hook for it, so it is unbound here instead. They
        // bind it afresh on the next open, and this unbinds it again.
        (this.datePicker ?? this.popover)?.unbindScrollListener();
        document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
        this.place();
        this.reveal();
        // Our own writes fire the observer once more; by then every value
        // already matches and place() writes nothing.
        this.styleObserver = new MutationObserver(() => this.place());
        // class too: a popover marks its flip with a class, not a style.
        this.styleObserver.observe(panel, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    private disconnect(): void {
        document.removeEventListener('scroll', this.onScroll, { capture: true });
        this.styleObserver?.disconnect();
        this.styleObserver = null;
        this.panel = null;
        this.target = null;
        this.container = null;
    }

    // Closed once the field is no longer wholly in view (see visibleBox):
    // partly above the drawer body's top or behind its action bar, or on the
    // page, under the fixed topbar or past the bottom of the screen. Through each component's
    // own close, so it tidies up as it would on Esc or a click outside.
    private closeOnceFieldOutOfView(): void {
        const target = this.target;
        if (!target) return;
        const field = target.getBoundingClientRect();
        const { top, bottom } = visibleBox(this.container);
        // As soon as any of it is cut off, not only once all of it is: the
        // popup hangs from the field's bottom edge, so a field partly behind
        // the action bar leaves its popup below the bar, cut off from the
        // part still showing. (1px of slack for sub-pixel positions.)
        if (field.top >= top - 1 && field.bottom <= bottom + 1) return;

        // Stop following at once: the close animation takes a moment, and
        // the scroll that is still going on would otherwise close it again.
        const focusInPopup = !!this.panel?.contains(document.activeElement);
        this.disconnect();
        if (this.select) {
            this.select.hide();
            // Focus stays with the field, as it does when Esc closes the list:
            // a select with a search box had it in that box, which goes with
            // the list, and it would otherwise fall to the page - the next Tab
            // starting over from the top. preventScroll, for the reason below.
            if (focusInPopup) (this.select.focusInputViewChild?.nativeElement as HTMLElement | undefined)?.focus({ preventScroll: true });
        }
        else if (this.autoComplete) this.autoComplete.hide();
        else if (this.popover) this.popover.hide();
        else if (this.datePicker) {
            // hideOverlay() puts focus back in the date field, and a plain
            // focus() scrolls that field back into view - undoing the
            // operator's scroll. The one call is made with preventScroll.
            const input = this.datePicker.inputfieldViewChild?.nativeElement as HTMLElement | undefined;
            if (input) input.focus = (options?: FocusOptions) => HTMLElement.prototype.focus.call(input, { ...options, preventScroll: true });
            this.datePicker.hideOverlay();
            if (input) delete (input as { focus?: unknown }).focus;
        }
    }

    // Below the field, written the way PrimeNG writes its own unflipped
    // placement: a body-appended popup in page coordinates (absolutePosition),
    // one rendered in place relative to the field (relativePosition).
    private place(): void {
        const panel = this.panel;
        const target = this.target;
        if (!panel || !target) return;
        const top = panel.parentElement === document.body ? `${target.getBoundingClientRect().bottom + window.scrollY}px` : `${target.offsetHeight}px`;
        if (panel.style.top !== top) panel.style.top = top;
        // Read back as 'center top' / 'center bottom', never as written.
        if (!panel.style.transformOrigin.includes('top')) panel.style.transformOrigin = 'top';
        if (this.popover) {
            // A popover's gap is in its stylesheet, and its flip is a class
            // that also swaps the gap's side and moves the arrow to the
            // bottom edge; dropping the class puts both back.
            if (panel.classList.contains('p-popover-flipped')) panel.classList.remove('p-popover-flipped');
            if (panel.hasAttribute('data-p-popover-flipped')) panel.removeAttribute('data-p-popover-flipped');
        } else if (panel.style.marginTop !== 'var(--p-anchor-gutter)') {
            panel.style.marginTop = 'var(--p-anchor-gutter)';
        }
    }

    // Scroll the field's container so the whole popup is in view - clear of
    // the drawer's action bar, not merely on screen. When there is not that
    // much room, as far as the field can go; the rest of the popup then lies
    // over the action bar, as an open popup lies over anything.
    private reveal(): void {
        const panel = this.panel;
        const target = this.target;
        if (!panel || !target) return;
        const margin = OpenBelowDirective.MARGIN;
        const field = target.getBoundingClientRect();
        const view = visibleBox(this.container);
        // offsetHeight, not the rect: the open animation's scale() is in the
        // rect and not in the layout height.
        const gap = parseFloat(getComputedStyle(panel).marginTop) || 0;
        const overflow = field.bottom + gap + panel.offsetHeight + margin - view.bottom;
        if (overflow <= 0) return;

        const container = this.container;
        const amount = Math.min(overflow, field.top - view.top - margin);
        if (amount <= 0) return;

        // This no longer closes the popup (see onScroll), and onScroll
        // follows the field once the event arrives; placed now as well, so
        // the frame in between does not show it where the field was.
        if (container) container.scrollTop += amount;
        else window.scrollBy(0, amount);
        this.place();
    }
}

// The nearest ancestor that scrolls its content, or null for the page.
function scrollParent(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
}

// The part of the screen where the field's container shows its content. For
// the drawer's body, its own box less whatever is pinned to its bottom edge
// (the sticky action bar with ยกเลิก / บันทึก, a direct child of the body):
// content scrolls behind that bar, so its top is where the view ends. For
// the page, the screen below the fixed topbar.
function visibleBox(container: HTMLElement | null): { top: number; bottom: number } {
    if (!container) return { top: topbarBottom(), bottom: window.innerHeight };
    const box = container.getBoundingClientRect();
    let bottom = Math.min(box.bottom, window.innerHeight);
    for (const child of Array.from(container.children)) {
        const style = getComputedStyle(child);
        if (style.position === 'sticky' && style.bottom !== 'auto') bottom = Math.min(bottom, child.getBoundingClientRect().top);
    }
    return { top: box.top, bottom };
}

// The page scrolls under the layout's fixed topbar, so a field scrolled up
// stops below it.
function topbarBottom(): number {
    const topbar = document.querySelector('.layout-topbar');
    return topbar && getComputedStyle(topbar).position === 'fixed' ? topbar.getBoundingClientRect().bottom : 0;
}
