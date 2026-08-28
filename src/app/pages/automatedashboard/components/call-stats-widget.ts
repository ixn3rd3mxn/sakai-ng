import { Component, computed, inject } from '@angular/core';
import { CallStatsDiff, CallStatsSummary } from '../call-stats.types';
import { CallStatsDataService } from '../services/call-stats-data.service';
import { parseIsoDate } from '../../dashboardclone/services/date-utils';

interface StatCard {
    label: string;
    value: string;
    color: string;
    /** null when there is no comparison to show - see CallStatsSummary.diff. */
    diff: number | null;
}

// `th-TH` resolves to the Buddhist calendar, so this renders e.g.
// "28 สิงหาคม พ.ศ. 2569" without a hand-maintained month/era table.
const THAI_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

@Component({
    standalone: true,
    selector: 'app-call-stats-widget',
    template: `
        <div class="col-span-12">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <div class="font-semibold text-xl">สถิติการให้บริการต่อวัน</div>
                <div class="text-sm text-surface-500 dark:text-surface-400">{{ status() }}</div>
            </div>
        </div>
        @for (card of cards(); track card.label) {
            <div class="col-span-6 lg:col-span-4 xl:col-span-2">
                <div class="card mb-0" [style.background]="'color-mix(in srgb, var(--p-' + card.color + '-500) 40%, var(--surface-card))'">
                    <div class="flex justify-between mb-4">
                        <div>
                            <span class="block font-medium mb-4 text-xl">{{ card.label }}</span>
                            <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">{{ card.value }}</div>
                        </div>
                    </div>
                    <!-- Omitted entirely when there is nothing to compare
                         against, rather than shown as +0 - which would claim
                         the previous day matched exactly. -->
                    @if (card.diff !== null) {
                        <span [class]="diffClass(card.diff)">{{ diffText(card.diff) }}</span>
                        <span> เทียบกับเมื่อวาน</span>
                    }
                </div>
            </div>
        }
    `
})
export class CallStatsWidget {
    private readonly data = inject(CallStatsDataService);

    // Label, colour, and which counter each card reads - the one place the
    // upstream field names are bound to what is on screen. Keyed on
    // CallStatsDiff rather than CallStatsSummary so a card can only ever name
    // one of the six counters, never `day` or `stale`.
    private static readonly CARDS: { label: string; color: string; field: keyof CallStatsDiff }[] = [
        { label: 'สายเข้าทั้งหมด', color: 'blue', field: 'incoming' },
        { label: 'รับสาย', color: 'emerald', field: 'answer' },
        { label: 'รับสาย SLA', color: 'emerald', field: 'sla' },
        { label: 'ไม่ได้รับสาย', color: 'red', field: 'abandon' },
        { label: 'ไม่ได้รับสาย คิวเต็ม', color: 'red', field: 'queue_full_abandon' },
        { label: 'โทรออก', color: 'violet', field: 'outgoing' }
    ];

    readonly cards = computed<StatCard[]>(() => {
        const summary = this.data.summary();
        // A dash, never 0, whenever the number would be made up: still
        // connecting, the source is unreachable, or the day is outside what it
        // retains. A real 0 (a quiet morning right after midnight) arrives as
        // available:true and is shown as 0.
        const hasNumbers = this.data.hasNumbers();

        // The comparison is only meaningful next to a real number, so it is
        // dropped whenever the counters themselves are a dash.
        const diff = hasNumbers ? summary!.diff : null;

        return CallStatsWidget.CARDS.map(({ label, color, field }) => ({
            label,
            color,
            value: hasNumbers ? (summary![field] as number).toLocaleString('en-US') : '—',
            diff: diff ? diff[field] : null
        }));
    });

    // Always names the day on screen. The service can be pointed at a past day
    // (`select()`), so the heading alone would not say which day these numbers
    // belong to - this line always does.
    readonly status = computed(() => {
        if (this.data.loading()) return 'กำลังเชื่อมต่อ...';

        const summary = this.data.summary();
        if (!summary) return 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้';

        const day = THAI_DATE.format(parseIsoDate(summary.day));
        if (!summary.available) return `ไม่พบข้อมูลของวันที่ ${day}`;
        if (this.data.isStale()) return `ข้อมูลวันที่ ${day} (ล่าสุด ${this.fetchedTime(summary)} กำลังลองใหม่)`;
        return `ข้อมูลวันที่ ${day} ณ เวลา ${this.fetchedTime(summary)}`;
    });

    // `fetched_at` is a naive Bangkok wall-clock string from the backend, so
    // the HH:MM is sliced straight out of it. Parsing it into a Date would
    // re-interpret it in the viewer's timezone and shift the time shown.
    private fetchedTime(summary: CallStatsSummary): string {
        return summary.fetched_at?.slice(11, 16) ?? '';
    }

    // Same colouring and formatting as incident-type-stats-widget, so the two
    // day-over-day figures read identically across the two dashboards.
    //
    // Note this is colour-by-direction, not by good/bad: on the "ไม่ได้รับสาย"
    // cards a rise is green even though more missed calls is worse. That is
    // inherited from the dispatch widget on purpose - diverging here would
    // mean the same green arrow meant "up" on one page and "better" on the
    // other, which is harder to read than one consistent convention.
    diffClass(diff: number): string {
        if (diff > 0) return 'text-green-500 font-medium';
        if (diff < 0) return 'text-red-500 font-medium';
        return 'text-gray-500 font-medium';
    }

    diffText(diff: number): string {
        return diff > 0 ? `+${diff}` : `${diff}`;
    }
}
