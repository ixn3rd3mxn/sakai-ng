import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-datetime-warning-banner',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        @if (visible) {
            <div class="pb-1 bg-surface-100 dark:bg-surface-950">
                <div class="bg-amber-500 dark:bg-amber-400 text-surface-900 dark:text-surface-950 py-4 px-6 lg:px-20 flex justify-center items-center flex-wrap">

                    <!-- แสดง text1 ในหน้าจอใหญ่ (lg ขึ้นไป) -->
                    <span class="hidden lg:flex leading-normal whitespace-nowrap">
                        text1: กำลังดูแดชบอร์ดในช่วงเวลาและวันที่ที่เลือก ลักษณะข้อมูลจะไม่เป็นปัจจุบัน
                    </span>

                    <!-- แสดง text2 ในหน้าจอเล็ก (น้อยกว่า lg) -->
                    <span class="lg:hidden leading-normal whitespace-nowrap">
                        text2: กำลังดูข้อมูลย้อนหลัง
                    </span>

                </div>
            </div>
        }
    `
})
export class DateTimeWarningBanner {
    @Input() visible: boolean = false;
    @Output() visibleChange = new EventEmitter<boolean>();
    @Output() dismissed = new EventEmitter<void>();

    onDismiss() {
        this.visible = false;
        this.visibleChange.emit(this.visible);
        this.dismissed.emit();
    }
}
