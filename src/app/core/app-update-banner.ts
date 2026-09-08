import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
 * When something on screen would be lost by reloading, the first click does
 * not reload - it shows what would be lost and asks again. The operator can
 * still go ahead; they just cannot do it by reflex.
 */
@Component({
    selector: 'app-update-banner',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ButtonModule],
    template: `
        @if (updates.updateAvailable()) {
            <div
                class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1200] max-w-[min(32rem,calc(100vw-2rem))]
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
        }
    `
})
export class AppUpdateBanner {
    readonly updates = inject(AppUpdateService);

    /**
     * Recomputed on every click rather than held as a signal: the blockers are
     * plain callbacks owned by whichever screen is open, and a stale "nothing
     * to lose" is the one answer this must never give.
     */
    private readonly blocked = signal<string | null>(null);

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
}
