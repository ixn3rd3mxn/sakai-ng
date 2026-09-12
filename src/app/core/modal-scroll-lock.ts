import { DestroyRef, Injectable, inject } from '@angular/core';

// Keeps PrimeNG's modal scroll lock consistent when dialogs stack.
//
// A modal dialog locks the page by putting p-overflow-hidden on the body
// (overflow: hidden plus padding-right of the scrollbar's width, held in
// --p-scrollbar-width). That is fine for one dialog. With one on top of
// another - ยืนยันการบันทึก over บันทึกข้อมูล - PrimeNG's own bookkeeping
// goes wrong twice:
//
//   opening the second   it measures the scrollbar again, which the first
//                        dialog already hid, gets 0, and rewrites the
//                        padding to nothing - the page shifts sideways
//                        while the second dialog is up
//   closing the second   its teardown strips the class outright, first
//                        dialog or no first dialog - the scrollbar comes
//                        back under a dialog that is still open, the page
//                        can be scrolled, and a body-appended dropdown
//                        opened from that dialog (CBD) drifts away from
//                        its field when it is
//
// So this holds two things steady for as long as any modal mask is in the
// DOM: the class, and the scrollbar width PrimeNG measured the first time,
// when the scrollbar was actually there to measure. Nothing is decided
// here - the values are PrimeNG's own, re-asserted. When the last mask
// goes, PrimeNG's normal teardown runs and this stands aside.
//
// Masks rather than the class, because the class is the thing that goes
// wrong. .p-overlay-mask is the class every modal mask shares - dialog,
// confirm dialog, drawer - and one is present exactly as long as its modal
// is, fade-out included.
//
// Started once from the root component so it covers every page.
@Injectable({ providedIn: 'root' })
export class ModalScrollLock {
    private static readonly MASK_SELECTOR = '.p-overlay-mask';
    private static readonly LOCK_CLASS = 'p-overflow-hidden';
    // PrimeNG's own token; it sets this inline on the body when it locks.
    private static readonly WIDTH_VAR = '--p-scrollbar-width';

    private readonly destroyRef = inject(DestroyRef);

    // The width PrimeNG measured on the first lock; null while unlocked.
    private width: string | null = null;

    constructor() {
        // The observer sees this class's own writes too, a callback later;
        // sync() is idempotent, so that round finds nothing to do.
        const observer = new MutationObserver(() => this.sync());
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        this.destroyRef.onDestroy(() => observer.disconnect());
    }

    private sync(): void {
        const body = document.body;
        const open = document.querySelector(ModalScrollLock.MASK_SELECTOR) !== null;

        if (!open) {
            this.width = null;
            return;
        }

        // First sight of a lock: PrimeNG has just measured a scrollbar that
        // was really there. Keep that number.
        if (this.width === null) {
            const measured = body.style.getPropertyValue(ModalScrollLock.WIDTH_VAR);
            if (!measured) return; // mask before lock; the next mutation brings it
            this.width = measured;
            return;
        }

        const hasClass = body.classList.contains(ModalScrollLock.LOCK_CLASS);
        const hasWidth = body.style.getPropertyValue(ModalScrollLock.WIDTH_VAR) === this.width;
        if (hasClass && hasWidth) return;

        body.classList.add(ModalScrollLock.LOCK_CLASS);
        body.style.setProperty(ModalScrollLock.WIDTH_VAR, this.width);
    }
}
