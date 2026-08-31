import { Component, computed, inject } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { CallStatsDiff, CallStatsSummary, CallTimes } from '../call-stats.types';
import { CallStatsDataService } from '../services/call-stats-data.service';
import { parseIsoDate } from '../../dashboardclone/services/date-utils';
import { formatDuration } from '../format-utils';

/** Whether a rise in this metric is an improvement, a deterioration, or
 *  neither. It is the metric's property, not the card's, which is why every
 *  entry in CARDS and TIME_CARDS declares one. */
type Polarity = 'up-good' | 'down-good' | 'neutral';

interface StatCard {
    label: string;
    value: string;
    color: string;
    /** null when there is no comparison to show - see CallStatsSummary.diff. */
    diff: number | null;
    polarity: Polarity;
}

// `th-TH` resolves to the Buddhist calendar, so this renders e.g.
// "28 สิงหาคม พ.ศ. 2569" without a hand-maintained month/era table.
const THAI_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

@Component({
    standalone: true,
    selector: 'app-call-stats-widget',
    imports: [SkeletonModule, ProgressSpinnerModule],
    styles: `
        /* Every card here is tinted - 40% of a status colour mixed into the
           surface - and the default skeleton is a 6% white wash tuned for a
           neutral background, which all but disappears on them. Tinting with
           the text colour instead keeps it legible on all five card colours
           and follows the theme, since --text-color flips in dark mode.
           Custom properties inherit, so setting them on .card reaches the
           skeletons without a descendant selector. */
        .card {
            --p-skeleton-background: color-mix(in srgb, var(--text-color) 12%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--text-color) 28%, transparent);
        }
    `,
    template: `
        <div class="col-span-12">
            <div class="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <div class="font-semibold text-xl">สถิติการให้บริการต่อวัน</div>
                <div class="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
                    @if (loading()) {
                        <p-progress-spinner [style]="{ width: '1rem', height: '1rem' }" strokeWidth="8" ariaLabel="กำลังโหลด" />
                    }
                    <span>{{ status() }}</span>
                </div>
            </div>
        </div>
        @for (card of cards(); track card.label) {
            <div class="col-span-6 lg:col-span-4 xl:col-span-2">
                <!-- h-full so every card in the row is the height of the
                     tallest. These are grid items and stretch already; without
                     it the card inside only grows to its own content, so one
                     label wrapping to a second line left the row ragged. -->
                <div class="card mb-0 h-full" [style.background]="'color-mix(in srgb, var(--p-' + card.color + '-500) 40%, var(--surface-card))'">
                    <div class="flex justify-between mb-4">
                        <div>
                            <!-- text-base, not text-xl: at 150% zoom with the
                                 sidebar open these are one-sixth-width, and
                                 "ไม่ได้รับสาย คิวเต็ม" - the longest of the six,
                                 with a space to break on - wrapped. -->
                            <span class="block font-medium mb-4 text-base">{{ card.label }}</span>
                            @if (loading()) {
                                <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">{{ card.value }}</div>
                            }
                        </div>
                    </div>
                    <!-- Omitted entirely when there is nothing to compare
                         against, rather than shown as +0 - which would claim
                         the previous day matched exactly. -->
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else if (card.diff !== null) {
                        <!-- text-sm: "-105 เทียบกับเมื่อวาน" is the widest this
                             line gets, and at base size it wrapped too. -->
                        <div class="text-sm">
                            <span [class]="diffClass(card.diff, card.polarity)">{{ diffText(card.diff) }}</span>
                            <span> เทียบกับเมื่อวาน</span>
                        </div>
                    }
                </div>
            </div>
        }
        @for (card of timeCards(); track card.label) {
            <div class="col-span-6 xl:col-span-3">
                <div class="card mb-0 h-full" [style.background]="'color-mix(in srgb, var(--p-' + card.color + '-500) 40%, var(--surface-card))'">
                    <div class="flex justify-between mb-4">
                        <div>
                            <!-- text-base, matching the counter row above: these
                                 four labels are the longest on the board and sit
                                 in quarter-width cards, so text-xl wrapped at
                                 150% browser zoom. -->
                            <span class="block font-medium mb-4 text-base">{{ card.label }}</span>
                            <!-- Smaller below sm: these cards are half-width on a
                                 phone and HH:MM:SS is eight characters, so 5xl
                                 overflows where the counters' 2-3 digits do not. -->
                            @if (loading()) {
                                <p-skeleton width="min(9rem, 100%)" height="3rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-4xl sm:text-5xl">{{ card.value }}</div>
                            }
                        </div>
                    </div>
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else if (card.diff !== null) {
                        <!-- Same xs/sm split as the counter row. This line is
                             longer still ("+00:00:04 เทียบกับเมื่อวาน"), so it
                             is the one that wrapped first on mobile. -->
                        <div class="text-xs sm:text-sm">
                            <span [class]="diffClass(card.diff, card.polarity)">{{ durationDiffText(card.diff) }}</span>
                            <span> เทียบกับเมื่อวาน</span>
                        </div>
                    }
                </div>
            </div>
        }
    `
})
export class CallStatsWidget {
    private readonly data = inject(CallStatsDataService);

    // Skeletons only while the first payload is in flight. Once it has
    // arrived, a missing number is a dash - "we asked and there is nothing
    // for this day" - and a skeleton would promise something still coming.
    protected readonly loading = this.data.loading;

    // Label, colour, and which counter each card reads - the one place the
    // upstream field names are bound to what is on screen. Keyed on
    // CallStatsDiff rather than CallStatsSummary so a card can only ever name
    // one of the six counters, never `day` or `stale`.
    private static readonly CARDS: { label: string; color: string; field: keyof CallStatsDiff; polarity: Polarity }[] = [
        // incoming and outgoing are neutral on purpose: call volume is demand,
        // not performance. Painting a busy day red would pass judgement on
        // something the centre does not control.
        { label: 'สายเข้าทั้งหมด', color: 'blue', field: 'incoming', polarity: 'neutral' },
        { label: 'รับสาย', color: 'emerald', field: 'answer', polarity: 'neutral' },
        { label: 'รับสาย SLA', color: 'emerald', field: 'sla', polarity: 'neutral' },
        { label: 'ไม่ได้รับสาย', color: 'red', field: 'abandon', polarity: 'down-good' },
        { label: 'ไม่ได้รับสาย คิวเต็ม', color: 'red', field: 'queue_full_abandon', polarity: 'down-good' },
        { label: 'โทรออก', color: 'violet', field: 'outgoing', polarity: 'neutral' }
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

        return CallStatsWidget.CARDS.map(({ label, color, field, polarity }) => ({
            label,
            color,
            polarity,
            value: hasNumbers ? (summary![field] as number).toLocaleString('en-US') : '—',
            diff: diff ? diff[field] : null
        }));
    });

    // Second row: durations rather than counts, so these format as H:MM:SS
    // instead of a thousands-separated integer.
    // Ordered and coloured in pairs: talk time (emerald) then answer time
    // (amber), so the colour groups the two metrics that measure the same
    // thing rather than distinguishing all four from each other.
    private static readonly TIME_CARDS: { label: string; color: string; field: keyof CallTimes; polarity: Polarity }[] = [
        // Talk time is neutral: a shorter call can mean an efficient handover
        // or a caller being rushed through an emergency, and nothing here can
        // tell those apart. Time-to-answer has no such ambiguity.
        { label: 'ค่าเฉลี่ยเวลาคุยสาย', color: 'emerald', field: 'avg_service', polarity: 'neutral' },
        { label: 'ระยะเวลารวมคุยสาย', color: 'emerald', field: 'total_service', polarity: 'neutral' },
        { label: 'ค่าเฉลี่ยเวลาตอบรับ', color: 'amber', field: 'avg_accept', polarity: 'down-good' },
        { label: 'เวลาที่ตอบรับนานที่สุด', color: 'amber', field: 'longest_accept', polarity: 'down-good' }
    ];

    readonly timeCards = computed<StatCard[]>(() => {
        // `times` is independent of the counters: this row can blank while the
        // six above still show numbers, so it gets its own guard rather than
        // reusing hasNumbers().
        const times = this.data.loading() ? null : (this.data.summary()?.times ?? null);
        // Only offered alongside a real duration, and independently of the
        // counter row's diff - the two feeds can be missing different days.
        const diff = times ? (this.data.summary()?.times_diff ?? null) : null;

        return CallStatsWidget.TIME_CARDS.map(({ label, color, field, polarity }) => ({
            label,
            color,
            polarity,
            value: times ? formatDuration(times[field]) : '—',
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

    // Green means better, red means worse, grey means neither - the one rule
    // on this board, and the convention every mainstream analytics tool uses.
    //
    // It replaces colouring by arithmetic sign, which duplicated the +/- that
    // is already printed and painted "12 more missed calls" green. The sign
    // still carries direction, so "-5" in green reads unambiguously as five
    // fewer and that being an improvement.
    //
    // Note /report/dashboard's incident-type-stats-widget still colours by
    // direction. Aligning it is a follow-up; its counts are mostly neutral, so
    // most of them would simply turn grey.
    diffClass(diff: number, polarity: Polarity): string {
        if (diff === 0 || polarity === 'neutral') return 'text-gray-500 font-medium';
        const better = polarity === 'up-good' ? diff > 0 : diff < 0;
        return better ? 'text-green-500 font-black' : 'text-red-500 font-black';
    }

    diffText(diff: number): string {
        return diff > 0 ? `+${diff}` : `${diff}`;
    }

    // Signed, and formatted as a duration so it reads against the HH:MM:SS
    // above it - a bare "+6" next to "00:00:12" gives no unit.
    durationDiffText(diff: number): string {
        return `${diff < 0 ? '-' : '+'}${formatDuration(Math.abs(diff))}`;
    }
}
