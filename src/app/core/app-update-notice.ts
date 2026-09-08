import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { AppUpdateService } from './app-update.service';

/**
 * The "a new version is available" notice, as a centred modal.
 *
 * It interrupts on purpose: the bottom bar this replaced was missed in
 * practice, and an update nobody sees is an update nobody applies.
 *
 * Two things keep the interruption from costing a call, and both matter more
 * here than they did for the bar:
 *
 *   - Nothing is autofocused (`focusOnShow` off). A dispatcher who is typing
 *     when this opens must not be able to reload the page with the Enter key
 *     they were already about to press.
 *   - A screen with unfinished work still has to be told twice. The first
 *     click surfaces what would be lost and relabels the button; only the
 *     second reloads.
 *
 * Dismissing snoozes for thirty minutes and leaves the marker in the topbar,
 * so closing it is cheap and the notice is never lost.
 */
@Component({
    selector: 'app-update-notice',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ButtonModule, DialogModule],
    template: `
        <p-dialog
            [visible]="updates.updateAvailable()"
            (visibleChange)="onVisibleChange($event)"
            [header]="updates.scope() === 'backend' ? 'ระบบเซิร์ฟเวอร์อัปเดตแล้ว' : 'มีเวอร์ชันใหม่ของระบบแล้ว'"
            [modal]="true"
            [draggable]="false"
            [resizable]="false"
            [focusOnShow]="false"
            [breakpoints]="{ '640px': '90vw' }"
            [style]="{ width: '30rem' }"
        >
            <div class="flex items-start gap-4">
                <i class="pi pi-sparkles text-primary text-2xl mt-1"></i>
                <div class="flex flex-col gap-2">
                    <div>รีเฟรชหน้าเพื่อใช้เวอร์ชันล่าสุดของระบบ</div>
                    <div class="text-sm text-surface-600 dark:text-surface-300">หากกำลังรับสาย สามารถกด “ไว้ก่อน” แล้วรีเฟรชเมื่อว่างได้</div>
                    @if (blockedReason(); as reason) {
                        <div class="text-sm text-orange-600 dark:text-orange-400 mt-1 flex items-start gap-2">
                            <i class="pi pi-exclamation-triangle mt-0.5"></i>
                            <span>{{ reason }} — รีเฟรชตอนนี้อาจทำให้ข้อมูลที่ยังไม่บันทึกหายไป</span>
                        </div>
                    }
                </div>
            </div>
            <ng-template #footer>
                <p-button label="ไว้ก่อน" severity="secondary" [text]="true" (click)="dismiss()" />
                <p-button [label]="blockedReason() ? 'รีเฟรชอยู่ดี' : 'รีเฟรช'" [severity]="blockedReason() ? 'warn' : 'primary'" (click)="onReload()" />
            </ng-template>
        </p-dialog>
    `
})
export class AppUpdateNotice {
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

    /** The close icon and Escape both land here. */
    onVisibleChange(visible: boolean): void {
        if (!visible) this.dismiss();
    }
}
