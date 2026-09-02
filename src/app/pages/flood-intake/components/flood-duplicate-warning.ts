import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { FloodDuplicate } from '../flood-intake.types';

// Advisory only. During a flood one house generates four or five calls, and
// without this the centre sends four or five boats - but repeat callers are
// sometimes genuinely separate incidents at the same address, so this warns
// and never blocks. A form that refused to save would lose the second one.
@Component({
    selector: 'app-flood-duplicate-warning',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        @if (matches().length > 0) {
            <div
                class="rounded border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 px-3 py-2 mb-4"
            >
                <div class="flex items-start gap-2">
                    <i class="pi pi-exclamation-triangle text-yellow-600 dark:text-yellow-400 mt-1"></i>
                    <div class="grow">
                        <div class="font-medium text-sm mb-1">
                            อาจซ้ำกับเคสที่รับแจ้งไปแล้วใน {{ windowHours() }} ชั่วโมงที่ผ่านมา
                        </div>
                        @for (match of matches(); track match.case_id) {
                            <div class="flex flex-wrap items-center gap-2 text-sm py-0.5">
                                <span>
                                    <!-- Time and tambon, never a row number:
                                         "ลำดับ" is counted at render time and
                                         means something different under every
                                         filter, so it could not identify a
                                         case even to the person reading it. -->
                                    อาจซ้ำกับเคส {{ match.time }} น. ต.{{ match.subdistrict_name }}
                                    <span class="text-surface-500">
                                        ({{ match.match_reason === 'phone' ? 'เบอร์เดียวกัน' : 'สถานที่ใกล้เคียง' }})
                                    </span>
                                </span>
                                <button
                                    pButton
                                    type="button"
                                    label="เปิดดู"
                                    class="p-button-link p-button-sm py-0"
                                    (click)="open.emit(match.case_id)"
                                ></button>
                            </div>
                        }
                        <div class="text-xs text-surface-500 mt-1">
                            ถ้าเป็นคนละเคสกัน บันทึกต่อได้ตามปกติ
                        </div>
                    </div>
                </div>
            </div>
        }
    `
})
export class FloodDuplicateWarning {
    readonly matches = input<FloodDuplicate[]>([]);
    readonly windowHours = input<number>(6);
    // Emits the real document id, which is the only stable handle a case has.
    readonly open = output<string>();
}
