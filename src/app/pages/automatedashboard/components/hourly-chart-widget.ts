import { afterNextRender, Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ChartModule, UIChart } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { CallStatsDataService } from '../services/call-stats-data.service';
import { HourlyBucket } from '../call-stats.types';

/** True when two payloads describe the same 24 hours.
 *
 *  Only the four fields the chart draws are compared - a bucket carrying a new
 *  `label` for the same hour and counts would be a backend bug, not a repaint
 *  worth doing. Cheap enough to run on every frame: 24 rows, four integers.
 */
function sameBuckets(a: HourlyBucket[] | null, b: HourlyBucket[] | null): boolean {
    if (a === b) return true;
    if (a === null || b === null || a.length !== b.length) return false;
    return a.every((bucket, index) => {
        const other = b[index];
        return bucket.hour === other.hour && bucket.incoming === other.incoming && bucket.answer === other.answer && bucket.missed === other.missed;
    });
}

/**
 * Calls per hour, as a stacked bar: answered on the bottom, missed on top, so
 * the full height of each bar is the hour's incoming total.
 *
 * The official NIEMS board draws this as three grouped series - incoming,
 * answered, abandoned - side by side. This deliberately does not, for two
 * reasons that came out of the data rather than taste:
 *
 * 1. `incoming` is exactly `answer + missed` in every hour of every day
 *    sampled, so it is not an independent series at all: it is the sum of the
 *    other two. Drawn as its own bar it triples the ink and asks the reader to
 *    compare two near-identical heights to work out what was missed. Stacked,
 *    the total *is* the bar and the split is read directly.
 *
 * 2. Three series across 24 hours is 72 bars in the width of one card. Two
 *    series stacked is 24, so each is three times wider and actually legible
 *    at the small counts this branch sees (a busy hour is ten calls).
 *
 * Missed sits on top rather than underneath on purpose - it is the exception,
 * and the eye finds an irregular top edge far faster than an irregular band
 * buried between the axis and another colour.
 */
@Component({
    standalone: true,
    selector: 'app-hourly-chart',
    imports: [ChartModule, SkeletonModule, ButtonModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="flex items-center justify-between gap-2 mb-4">
            <div class="font-semibold text-xl">สถิติจำนวนการใช้บริการตามเวลา</div>
            <!-- Opens the official NIEMS page in a new tab. An anchor rather
                 than a button because pButton is an attribute directive, so
                 this is a real link: middle-click works, and the board
                 itself is never navigated away from. -->
            <a
                pButton
                href="https://rnis-qm.niems.go.th/chart-by-time"
                target="_blank"
                rel="noopener noreferrer"
                label="ดูรายละเอียด"
                icon="pi pi-external-link"
                iconPos="right"
                severity="secondary"
                size="small"
                [text]="true"
                class="shrink-0"
            ></a>
        </div>
        @if (!chartReady()) {
            <p-skeleton width="100%" height="22rem" />
        } @else if (isEmpty()) {
            <!-- Chart.js draws axes but no bars for an all-zero stack, which
                 reads as a broken canvas. A quiet day - or the first hour of
                 one - says so in words instead. -->
            <div class="h-88 flex flex-col items-center justify-center gap-3 text-muted-color">
                <i class="pi pi-chart-bar text-5xl opacity-30"></i>
                <span>ยังไม่มีการบันทึกข้อมูล</span>
            </div>
        } @else {
            <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="h-88" />
        }
    </div>`
})
export class HourlyChartWidget {
    private readonly layoutService = inject(LayoutService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly data = inject(CallStatsDataService);

    // Compared by value, not by reference.
    //
    // The call-stats stream pushes a frame every LIVE_POLL_SECONDS (5s) whether
    // or not anything changed - `fetched_at` is in the payload signature on
    // purpose, so an idle board can prove it is still alive. Every frame is
    // freshly parsed JSON, so `hourly` is a new array each time and a signal
    // comparing by reference sees 24 identical buckets as a change. That fired
    // the data effect, which called chartData.set(), which had PrimeNG destroy
    // and rebuild the chart - replaying its entry animation every five seconds.
    //
    // Fixing it here rather than by quietening the heartbeat: the heartbeat is
    // doing its job, and a widget should not repaint for a payload whose
    // contents it has already drawn.
    private readonly buckets = computed(() => this.data.summary()?.hourly ?? null, { equal: sameBuckets });

    // Built inside initChart, so they describe the dataset actually drawn
    // rather than the one that will be drawn 150ms from now.
    protected readonly chartReady = signal(false);
    protected readonly isEmpty = signal(false);

    protected readonly chartData = signal<any>(null);
    protected readonly chartOptions = signal<any>(null);

    // The rendered chart, so a data change can be pushed into the existing
    // chart.js instance instead of replacing the component's `data` input.
    // Undefined whenever the canvas is not on screen - while loading, and in
    // the empty state - which is why every use of it is guarded.
    private readonly chartRef = viewChild(UIChart);

    private chartTimeoutId: ReturnType<typeof setTimeout> | undefined;
    private pendingOptions = false;

    constructor() {
        afterNextRender(() => this.scheduleInitChart(true));

        effect(() => {
            if (this.data.loading()) {
                this.chartReady.set(false);
            }
        });

        // Theme and data are tracked apart because PrimeNG reinitialises the
        // chart from *both* its `data` and its `options` setter: reassigning an
        // options object that had not changed cost a second full destroy()/new
        // Chart() on every push from the stream.
        let firstTheme = true;
        effect(() => {
            this.layoutService.layoutConfig().darkTheme;
            if (firstTheme) {
                firstTheme = false;
                return;
            }
            this.scheduleInitChart(true);
        });

        let firstData = true;
        effect(() => {
            this.buckets();
            if (firstData) {
                firstData = false;
                return;
            }
            this.scheduleInitChart(false);
        });

        this.destroyRef.onDestroy(() => clearTimeout(this.chartTimeoutId));
    }

    private scheduleInitChart(withOptions: boolean) {
        // A theme change coalescing with a data change inside the debounce
        // window still has to rebuild the options.
        this.pendingOptions = this.pendingOptions || withOptions;
        clearTimeout(this.chartTimeoutId);
        this.chartTimeoutId = setTimeout(() => {
            const withOpts = this.pendingOptions;
            this.pendingOptions = false;
            this.initChart(withOpts);
        }, 150);
    }

    private initChart(withOptions = true) {
        const style = getComputedStyle(document.documentElement);
        const borderColor = style.getPropertyValue('--surface-border');
        const textMutedColor = style.getPropertyValue('--text-color-secondary');
        // The same two colours the counter cards use, so "รับสาย" and
        // "ไม่ได้รับสาย" mean one thing across the whole page.
        const answered = style.getPropertyValue('--p-emerald-500');
        const missed = style.getPropertyValue('--p-red-500');

        const buckets = this.buckets();
        // 24 zero-height columns rather than an empty axis while we wait, so
        // the canvas keeps its size and the card does not jump on first paint.
        const rows = buckets ?? Array.from({ length: 24 }, (_, hour) => ({ hour, label: `${`${hour}`.padStart(2, '0')}:00`, incoming: 0, answer: 0, missed: 0 }));

        this.chartReady.set(!this.data.loading() && buckets !== null);
        this.isEmpty.set(rows.every((bucket) => bucket.incoming === 0));

        // Grow the bar that changed, rather than regrowing all 24 from zero.
        //
        // PrimeNG's `data` setter calls reinit(), which is destroy() + new
        // Chart() - and a brand new chart has no previous state to animate
        // from, so every update replayed the whole entry animation. Chart.js
        // will tween from what is on screen to the new values, but only if the
        // same instance is updated instead of replaced.
        //
        // So on a data-only change the dataset arrays are swapped inside the
        // live chart and refresh() (chart.update()) is called, leaving the
        // component's `data` input pointing at the same object so the setter
        // never fires. An 8 that becomes a 9 rises by one call.
        //
        // Options changes still go the long way: a theme swap has to rebuild
        // the scales and colours, and it is rare enough that a full replay is
        // fine there.
        const chartComponent = this.chartRef();
        const live = chartComponent?.chart;
        if (!withOptions && live && live.data?.datasets?.length === 2) {
            live.data.datasets[0].data = rows.map((bucket) => bucket.answer);
            live.data.datasets[1].data = rows.map((bucket) => bucket.missed);
            chartComponent.refresh();
            return;
        }

        this.chartData.set({
            labels: rows.map((bucket) => bucket.label),
            datasets: [
                {
                    label: 'รับสาย',
                    backgroundColor: answered,
                    data: rows.map((bucket) => bucket.answer),
                    stack: 'calls',
                    // Square where the missed segment sits on top, rounded
                    // only where the bar actually ends.
                    borderRadius: 4,
                    borderSkipped: 'bottom'
                },
                {
                    label: 'ไม่ได้รับสาย',
                    backgroundColor: missed,
                    data: rows.map((bucket) => bucket.missed),
                    stack: 'calls',
                    borderRadius: 4,
                    borderSkipped: 'bottom'
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
            maintainAspectRatio: false,
            // Hovering anywhere in the column reports the whole hour, so the
            // tooltip answers "what happened at 14:00" rather than requiring a
            // hit on one four-pixel segment.
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: textMutedColor, usePointStyle: true, pointStyle: 'rectRounded', padding: 16 }
                },
                tooltip: {
                    callbacks: {
                        // The total is the one number the stack does not state
                        // outright, and it is the headline for the hour.
                        footer: (items: any[]) => `สายเข้าทั้งหมด ${items.reduce((sum, item) => sum + (item.parsed.y ?? 0), 0)}`
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: textMutedColor,
                        // Horizontal, and thinned automatically when the card is
                        // too narrow for 24 of them. The official board rotates
                        // its labels 45 degrees instead, which is harder to read
                        // for the sake of showing every hour twice over.
                        maxRotation: 0,
                        autoSkip: true,
                        autoSkipPadding: 12
                    },
                    grid: { color: 'transparent', borderColor: 'transparent' }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    // Calls are whole things; 2.5 on the axis would be nonsense.
                    ticks: { color: textMutedColor, precision: 0 },
                    grid: { color: borderColor, borderColor: 'transparent', drawTicks: false }
                }
            }
        });
    }
}
