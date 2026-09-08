import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { AppUpdateService } from './app-update.service';

/**
 * The "a new version is available" notice.
 *
 * Deliberately a bar the operator can ignore, not a dialog: it is anchored
 * bottom-centre, takes no focus, blocks no input and never times out. A
 * console that is mid-call keeps working exactly as it did; the bar is simply
 * still there when the call ends.
 *
 * The entrance animation is not decoration. Most deploys are noticed while
 * nobody is looking at the screen, so without it the operator comes back to a
 * bar that appears to have always been there - and something static at the
 * edge of vision is effectively invisible. Motion is what peripheral vision
 * is built to catch, which is why it replays on returning to the tab rather
 * than only on first appearance.
 *
 * When something on screen would be lost by reloading, the first click does
 * not reload - it shows what would be lost and asks again. The operator can
 * still go ahead; they just cannot do it by reflex.
 */
@Component({
    selector: 'app-update-banner',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ButtonModule],
    styles: [
        `
            /* Centring is done by the wrapper's flexbox rather than a Tailwind
               translate utility, so these keyframes own \`transform\` outright:
               a utility that also set it would compose with the animation and
               shove the bar sideways while it played. */
            @keyframes update-banner-in {
                from {
                    opacity: 0;
                    transform: translateY(1.25rem) scale(0.98);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            .enter {
                animation: update-banner-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
            }

            @keyframes update-banner-fade {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }

            @media (prefers-reduced-motion: reduce) {
                /* Still announces itself, just without the movement. */
                .enter {
                    animation: update-banner-fade 200ms ease-out both;
                }
            }
        `
    ],
    template: `
        @if (updates.updateAvailable()) {
            <!-- Full width so the bar centres without a transform, and
                 click-through so spanning the viewport costs the page nothing. -->
            <div class="fixed bottom-4 left-0 right-0 z-[1200] flex justify-center px-4 pointer-events-none">
                <div
                    #bar
                    class="enter pointer-events-auto w-full sm:w-auto sm:max-w-[32rem]
                           rounded-lg border border-surface-200 dark:border-surface-700
                           bg-surface-0 dark:bg-surface-900 shadow-lg px-4 py-3"
                    role="status"
                    aria-live="polite"
                >
                    <div class="flex items-start gap-3">
                        <i class="pi pi-sparkles text-primary mt-0.5"></i>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium text-sm">
                                @if (updates.scope() === 'backend') {
                                    ระบบเซิร์ฟเวอร์อัปเดตแล้ว
                                } @else {
                                    มีเวอร์ชันใหม่ของระบบแล้ว
                                }
                            </div>
                            <div class="text-xs text-surface-600 dark:text-surface-300 mt-0.5">รีเฟรชหน้าเพื่อใช้เวอร์ชันล่าสุด — ทำได้เมื่อว่างจากสาย</div>
                            @if (blockedReason(); as reason) {
                                <div class="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1.5">
                                    <i class="pi pi-exclamation-triangle mt-0.5"></i>
                                    <span>{{ reason }} — รีเฟรชตอนนี้อาจทำให้ข้อมูลที่ยังไม่บันทึกหายไป</span>
                                </div>
                            }
                        </div>
                        <div class="flex items-center gap-1 shrink-0 self-center">
                            <button pButton type="button" label="ไว้ก่อน" class="p-button-sm p-button-text" (click)="dismiss()"></button>
                            <button pButton type="button" [label]="blockedReason() ? 'รีเฟรชอยู่ดี' : 'รีเฟรช'" [severity]="blockedReason() ? 'warn' : 'primary'" class="p-button-sm" (click)="onReload()"></button>
                        </div>
                    </div>
                </div>
            </div>
        }
    `
})
export class AppUpdateBanner {
    readonly updates = inject(AppUpdateService);

    private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

    /**
     * Recomputed on every click rather than held as a signal: the blockers are
     * plain callbacks owned by whichever screen is open, and a stale "nothing
     * to lose" is the one answer this must never give.
     */
    private readonly blocked = signal<string | null>(null);

    constructor() {
        // Returning to a tab that was already showing the bar is the case the
        // entrance animation cannot cover on its own: the element was created
        // while the tab was hidden, so the animation had finished long before
        // anybody looked. Replaying it here is the whole point - the operator
        // comes back and sees movement rather than furniture.
        const onVisible = () => {
            if (document.visibilityState === 'visible' && this.updates.updateAvailable()) this.replayEntrance();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        inject(DestroyRef).onDestroy(() => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
        });
    }

    blockedReason(): string | null {
        return this.blocked();
    }

    onReload(): void {
        const reason = this.updates.blockedReason();
        // First click on a screen with unfinished work only surfaces it. The
        // second click - the button now reads "reload anyway" - goes ahead.
        if (reason && this.blocked() === null) {
            this.blocked.set(reason);
            return;
        }
        this.updates.reload();
    }

    dismiss(): void {
        this.blocked.set(null);
        this.updates.snooze();
    }

    /**
     * Restart the CSS animation.
     *
     * Removing the class is not enough on its own - the browser coalesces the
     * remove and the re-add into no change at all. Reading `offsetWidth`
     * between them forces the reflow that makes them two separate states.
     */
    private replayEntrance(): void {
        const element = this.bar()?.nativeElement;
        if (!element) return;
        element.classList.remove('enter');
        void element.offsetWidth;
        element.classList.add('enter');
    }
}
