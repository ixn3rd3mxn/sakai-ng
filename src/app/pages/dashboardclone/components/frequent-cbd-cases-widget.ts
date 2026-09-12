import { afterNextRender, Component, DestroyRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ChartModule, UIChart } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { CbdItem } from '../dispatch.types';

/** True when two payloads describe the same ranking.
 *
 *  Order matters as well as content - the list arrives sorted by count, so two
 *  CBDs swapping places is a real change to the chart even though the same
 *  names and the same numbers are present.
 */
function sameItems(a: CbdItem[], b: CbdItem[]): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return a.every((item, index) => {
        const other = b[index];
        return item.cbd_id === other.cbd_id && item.cbd_name === other.cbd_name && item.count === other.count;
    });
}

@Component({
    standalone: true,
    selector: 'app-frequent-cbd-cases',
    imports: [ChartModule, SkeletonModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">เคส CBD ที่เกิดเหตุบ่อยที่สุด</div>
        <!-- The 25rem box lives out here, on a plain block div, rather than on
             whichever branch happens to be showing.
             Chart.js measures its container the moment the canvas is created
             and, because this chart sets maintainAspectRatio:false, takes the
             height from that box verbatim. If the box is not already its final
             height at that instant, the ResizeObserver fires straight after
             with the real one and chart.js answers it with update('resize') -
             whose transition is duration:0, so every bar snaps to full height
             and the entry animation is lost. Sizing the wrapper instead of the
             chart means the height is settled before p-chart even exists. -->
        <div class="h-100">
            @if (!chartReady()) {
                <p-skeleton width="100%" height="100%" />
            } @else if (isEmpty()) {
                <div class="h-full flex flex-col items-center justify-center gap-3 text-muted-color">
                    <i class="pi pi-chart-bar text-5xl opacity-30"></i>
                    <span>ยังไม่มีการบันทึกข้อมูล</span>
                </div>
            } @else {
                <!-- "block" explicitly: PrimeNG sets display:block through a
                     host binding, and h-full is meaningless on an inline box
                     until that lands. -->
                <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="block h-full" />
            }
        </div>
    </div>`
})
export class FrequentCbdCasesWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

    items = input<CbdItem[]>([]);

    // Set by the dashboard while the stream has not yet delivered a
    // snapshot for the current selection.
    loading = input<boolean>(false);

    // Compared by value, not by reference.
    //
    // The dashboard passes `summary()?.frequent_cbd ?? []` straight off the
    // SSE stream, so a push that only changed some *other* corner of the board
    // - one new incident in the recent table - still hands this widget a brand
    // new array holding the same rows, and the `?? []` mints a new empty array
    // every time besides. Read by reference that is a change, which fired the
    // data effect, which called chartData.set(), which had PrimeNG destroy and
    // rebuild the chart: all five bars regrowing from the axis for a ranking
    // that had not moved.
    //
    // Fixing it here rather than upstream: the stream is doing its job, and a
    // widget should not repaint for a payload whose contents it has already
    // drawn.
    private readonly rows = computed(() => this.items(), { equal: sameItems });

    // The chart is only shown once `initChart` has actually run against
    // delivered data - the first build happens before anything has
    // arrived and would otherwise paint a chart full of zeros.
    protected readonly chartReady = signal(false);

    // Set from inside `initChart`, so it always describes the dataset that
    // is actually drawn rather than the input that will be drawn 150ms from
    // now. Chart.js renders nothing at all for an all-zero doughnut or an
    // empty bar series, which leaves a card that looks broken rather than
    // one that says there were no incidents.
    protected readonly isEmpty = signal(false);

    chartData = signal<any>(null);

    chartOptions = signal<any>(null);

    // The rendered chart, so a data change can be pushed into the existing
    // chart.js instance instead of replacing the component's `data` input.
    // Undefined whenever the canvas is not on screen - while loading, and in
    // the empty state - which is why every use of it is guarded.
    private readonly chartRef = viewChild(UIChart);

    private chartTimeoutId: ReturnType<typeof setTimeout> | undefined;

    private pendingOptions = false;

    constructor() {
        afterNextRender(() => {
            this.scheduleInitChart(true);
        });

        // Hide the chart the moment a new selection starts loading. Without
        // this the canvas keeps showing the previous shift's figures until
        // the rebuild lands, which is the same "confident but wrong" state
        // the skeletons exist to prevent - just harder to notice, because it
        // is real data under the wrong heading.
        //
        // Taking the skeleton back down is this effect's job too, and it has
        // to be, because nothing else can be relied on to do it. chartReady is
        // only ever raised inside initChart, and initChart only runs when a
        // tracked signal changes - but `rows` is compared by value, and two
        // shifts that both recorded no CBD cases compare equal as a pair of
        // empty lists. Nothing is notified, initChart never runs, and the
        // skeleton put up above stays up forever.
        //
        // Re-arming on the loading edge instead means a finished load always
        // rebuilds, whether or not this widget's own figures moved.
        let wasLoading = false;
        effect(() => {
            if (this.loading()) {
                this.chartReady.set(false);
                wasLoading = true;
                return;
            }
            if (wasLoading) {
                wasLoading = false;
                // Data-only: a shift switch does not touch the theme, and the
                // canvas is unmounted anyway, so it will be built fresh from
                // the options already in place.
                this.scheduleInitChart(false);
            }
        });

        // A theme change recolours both the datasets and the axis/legend
        // options; a data change only ever touches the datasets. They are
        // tracked separately because PrimeNG reinitialises the chart from
        // *both* its `data` and its `options` setter, so reassigning an
        // options object that had not actually changed was costing a second
        // full destroy()/new Chart() on every push from the stream.
        let isFirstThemeRun = true;
        effect(() => {
            this.layoutService.layoutConfig().darkTheme;
            if (isFirstThemeRun) {
                isFirstThemeRun = false;
                return;
            }
            this.scheduleInitChart(true);
        });

        let isFirstDataRun = true;
        effect(() => {
            this.rows();
            if (isFirstDataRun) {
                isFirstDataRun = false;
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

    initChart(withOptions = true) {
        const documentStyle = getComputedStyle(document.documentElement);
        const borderColor = documentStyle.getPropertyValue('--surface-border');
        const textMutedColor = documentStyle.getPropertyValue('--text-color-secondary');

        const items = this.rows();
        const palette = [documentStyle.getPropertyValue('--p-primary-600'), documentStyle.getPropertyValue('--p-primary-500'), documentStyle.getPropertyValue('--p-primary-400'), documentStyle.getPropertyValue('--p-primary-300'), documentStyle.getPropertyValue('--p-primary-200')];

        const labels = items.map((item) => item.cbd_name);
        const counts = items.map((item) => item.count);
        const colours = items.map((_, index) => palette[index % palette.length]);

        // No null to check against, unlike the hourly chart's buckets: the
        // dashboard collapses "not delivered yet" to `[]`, so `loading` is the
        // only thing that separates an empty shift from an unanswered one.
        this.chartReady.set(!this.loading());
        this.isEmpty.set(items.length === 0);

        // Grow the bar that changed, rather than regrowing all of them from
        // the axis.
        //
        // PrimeNG's `data` setter calls reinit(), which is destroy() + new
        // Chart() - and a brand new chart has no previous state to animate
        // from, so every update replayed the whole entry animation. Chart.js
        // will tween from what is on screen to the new values, but only if the
        // same instance is updated instead of replaced.
        //
        // So on a data-only change the labels and the dataset arrays are
        // swapped inside the live chart and refresh() (chart.update()) is
        // called, leaving the component's `data` input pointing at the same
        // object so the setter never fires. An 8 that becomes a 9 rises by one
        // case; a CBD that overtakes another slides past it.
        //
        // Options changes still go the long way: a theme swap has to rebuild
        // the scales and colours, and it is rare enough that a full replay is
        // fine there.
        const chartComponent = this.chartRef();
        const live = chartComponent?.chart;
        if (!withOptions && live && live.data?.datasets?.length === 1) {
            live.data.labels = labels;
            live.data.datasets[0].data = counts;
            live.data.datasets[0].backgroundColor = colours;
            chartComponent.refresh();
            return;
        }

        this.chartData.set({
            labels,
            datasets: [
                {
                    backgroundColor: colours,
                    data: counts,
                    borderRadius: {
                        topLeft: 8,
                        topRight: 8,
                        bottomLeft: 0,
                        bottomRight: 0
                    },
                    borderSkipped: false,
                    barThickness: 53
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
            maintainAspectRatio: false,
            // Chart.js snaps on resize, and this chart gets resized twice in
            // the same millisecond it is created: once in 'attach' mode as the
            // canvas takes its size, then again in 'resize' mode. The default
            // transitions.resize.animation.duration is 0, so that second pass
            // drove every bar straight to full height and the entry animation
            // - which had started microseconds earlier - was never seen. The
            // doughnut on this page escapes it because its width resolves to a
            // whole 300px, while this one lands on a fractional 542.5 and gets
            // measured twice.
            //
            // Giving the resize transition a real duration means that second
            // pass tweens from where the bars currently are (still near zero)
            // rather than teleporting them, so the growth reads as one motion.
            // It also makes genuine window resizes glide instead of jumping.
            transitions: { resize: { animation: { duration: 400, easing: 'easeOutQuart' } } },
            // Hovering anywhere in the column reports that CBD, so the tooltip
            // answers "how many here" rather than requiring a hit on the bar
            // itself - which for a one-case CBD is a few pixels tall.
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    // One series, colour-coded by rank: the legend would only
                    // repeat the axis.
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: textMutedColor,
                        // Horizontal. The names are the only way to tell the
                        // bars apart, so unlike the hourly chart's 24 hour
                        // labels none of them may be skipped - Chart.js rotates
                        // rather than drops when autoSkip is off.
                        autoSkip: false
                    },
                    grid: {
                        color: 'transparent',
                        borderColor: 'transparent'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: textMutedColor,
                        // Cases are whole things; 2.5 on the axis would be
                        // nonsense.
                        precision: 0
                    },
                    grid: {
                        color: borderColor,
                        borderColor: 'transparent',
                        drawTicks: false
                    }
                }
            }
        });
    }
}
