import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TimePeriod } from '../dispatch.types';

@Component({
    selector: 'app-dispatch-datetime-warning',
    standalone: true,
    imports: [ButtonModule],
    template: `
        @if (visible) {
            <div class="pb-1 bg-surface-100 dark:bg-surface-950">
                <div 
                    class="bg-amber-500 dark:bg-amber-400 text-surface-900 dark:text-surface-950 py-4 px-6 lg:px-20 flex justify-center items-center flex-wrap relative overflow-hidden"
                    style="border-radius: var(--content-border-radius);"
                >
                    <!-- Left abstract shape (gradient opacity: จากเข้มไปอ่อนทางขวา) -->
                    <div
                        class="absolute left-0 top-0 bottom-0 w-[243px] max-[730px]:hidden"
                        style="
                            background: url('/images/banner-shapes.png') no-repeat left center;
                            background-size: contain;
                            mask-image: linear-gradient(to right, black, transparent);
                            -webkit-mask-image: linear-gradient(to right, black, transparent);
                        "
                    ></div>

                    <!-- Right abstract shape (gradient opacity: จากเข้มไปอ่อนทางซ้าย, mirrored) -->
                    <div
                        class="absolute right-0 top-0 bottom-0 w-[243px] max-[730px]:hidden"
                        style="
                            background: url('/images/banner-shapes.png') no-repeat right center;
                            background-size: contain;
                            transform: scaleX(-1);
                            mask-image: linear-gradient(to left, black, transparent);
                            -webkit-mask-image: linear-gradient(to right, black, transparent);
                        "
                    ></div>

                    <!-- Content -->
                    <div class="relative z-10 w-full text-center">
                        <!-- แสดง text1 ในหน้าจอใหญ่ (lg ขึ้นไป) -->
                        <span class="hidden lg:inline leading-normal whitespace-nowrap">
                            กำลังดูแดชบอร์ดวันที่ <strong>{{ formatDate(selectedDate) }}</strong> เวร <strong>{{ selectedTime?.name || '-' }}</strong> ลักษณะข้อมูลจะไม่เป็นปัจจุบัน
                        </span>

                        <!-- แสดง text2 ในหน้าจอเล็ก (น้อยกว่า lg) -->
                        <span class="lg:hidden leading-normal whitespace-nowrap">
                            กำลังดูข้อมูลย้อนหลัง: <strong>{{ formatShortDate(selectedDate) }}</strong> เวร <strong>{{ selectedTime?.name || '-' }}</strong>
                        </span>
                    </div>
                </div>
            </div>
        }
    `
})
export class DispatchDateTimeWarning {
    @Input() visible: boolean = false;
    @Input() selectedDate: Date | undefined;
    @Input() selectedTime: TimePeriod | null | undefined;
    @Output() visibleChange = new EventEmitter<boolean>();

    formatDate(date: Date | undefined): string {
        if (!date) return '-';
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatShortDate(date: Date | undefined): string {
        if (!date) return '-';
        return date.toLocaleDateString('th-TH', {
            month: 'short',
            day: 'numeric'
        });
    }
}