import { Component, Input } from '@angular/core';

// Trimmed version of dashboardclone's dispatch-datetime-warning: same
// historical/current color-coded banner pattern, but date-only (no shift/time),
// since this page has no shift concept - see incident-history-date-dial.ts.
@Component({
    selector: 'app-incident-history-date-banner',
    standalone: true,
    imports: [],
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
                <div class="relative z-10 w-full text-center">
                    @if (historical) {
                        <span class="hidden lg:inline leading-normal whitespace-nowrap font-semibold text-xl"> กำลังดูประวัติวันที่ {{ formatDate(selectedDate) }} </span>
                        <span class="lg:hidden leading-normal whitespace-nowrap font-semibold text-xl"> กำลังดูข้อมูลย้อนหลัง: {{ formatShortDate(selectedDate) }} </span>
                    } @else {
                        <span class="leading-normal whitespace-nowrap font-semibold text-xl">{{ formatDate(selectedDate) }}</span>
                    }
                </div>
            </div>
        </div>
    `
})
export class IncidentHistoryDateBanner {
    @Input() historical: boolean = false;
    @Input() selectedDate: Date | undefined;

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
