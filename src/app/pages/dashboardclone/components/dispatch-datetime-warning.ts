import { Component, Input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TimePeriod } from '../dispatch.types';

@Component({
    selector: 'app-dispatch-datetime-warning',
    standalone: true,
    imports: [ButtonModule],
    template: `
        <div class="pb-1 bg-surface-100 dark:bg-surface-950">
            <div
                class="py-2 px-6 lg:px-20 flex justify-center items-center flex-wrap relative overflow-hidden"
                [class.bg-amber-500]="historical"
                [class.dark:bg-amber-400]="historical"

                [class.bg-surface-0]="!historical"
                [class.dark:bg-surface-900]="!historical"

                style="border-radius: var(--content-border-radius);"
            >
                @if (historical) {
                    <!-- Left abstract shape (gradient opacity: จากเข้มไปอ่อนทางขวา) -->
                    <div
                        class="absolute left-0 top-0 bottom-0 w-[243px] max-[730px]:hidden"
                    ></div>

                    <!-- Right abstract shape (gradient opacity: จากเข้มไปอ่อนทางซ้าย, mirrored) -->
                    <div
                        class="absolute right-0 top-0 bottom-0 w-[243px] max-[730px]:hidden"
                    ></div>
                }

                <!-- Content -->
                <div class="relative z-10 w-full text-center">
                    @if (historical) {
                        <!-- แสดง text1 ในหน้าจอใหญ่ (lg ขึ้นไป) -->
                        <span class="hidden lg:inline leading-normal whitespace-nowrap font-semibold text-xl">
                            กำลังดูแดชบอร์ดวันที่ {{ formatDate(selectedDate) }}{{ selectedTime?.name || '-' }} ลักษณะข้อมูลจะไม่เป็นปัจจุบัน
                        </span>

                        <!-- แสดง text2 ในหน้าจอเล็ก (น้อยกว่า lg) -->
                        <span class="lg:hidden leading-normal whitespace-nowrap font-semibold text-xl">
                            กำลังดูข้อมูลย้อนหลัง: {{ formatShortDate(selectedDate) }}{{ selectedTime?.name || '-' }}
                        </span>
                    } @else {
                        <span class="leading-normal whitespace-nowrap font-semibold text-xl">
                            {{ selectedTime?.name || '-' }}&nbsp;{{ formatDate(selectedDate) }}
                        </span>
                    }
                </div>
            </div>
        </div>
    `
})
export class DispatchDateTimeWarning {
    @Input() historical: boolean = false;
    @Input() selectedDate: Date | undefined;
    @Input() selectedTime: TimePeriod | null | undefined;

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