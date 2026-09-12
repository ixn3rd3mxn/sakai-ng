import { afterNextRender, Component, DestroyRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { ChartModule, UIChart } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { DailySummary } from '../dispatch.types';

/** True when two payloads describe the same three shift counts.
 *
 *  Only the three numbers the doughnut draws are compared - object identity
 *  never is, because every frame off the stream is freshly parsed JSON and so
 *  always a new object.
 */
function sameSummary(a: DailySummary | null, b: DailySummary | null): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    return a.morning === b.morning && a.afternoon === b.afternoon && a.night === b.night;
}

@Component({
    standalone: true,
    selector: 'app-daily-incident-summary',
    imports: [ChartModule, SkeletonModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ผลรวมทั้งหมดต่อวัน</div>
        <!-- One square box holding all three states, so the card never changes
             height as the skeleton gives way to the chart.
             The square is driven by *width* - w-full capped at max-w-90, with
             aspect-square deriving the height - rather than by a fixed height.
             Driving it from a fixed height instead pinned the canvas at 360px
             across every breakpoint, which fitted a desktop column but hung
             48px outside the card on a 375px phone. This way the box is
             min(card width, 22.5rem) and simply gets smaller when the card
             does, so it can never overflow. -->
        <div class="w-full max-w-90 aspect-square mx-auto flex items-center justify-center">
            @if (!chartReady()) {
                <p-skeleton width="100%" height="100%" shape="circle" />
            } @else if (isEmpty()) {
                <div class="flex flex-col items-center justify-center gap-3 text-muted-color">
                    <i class="pi pi-chart-pie text-5xl opacity-30"></i>
                    <span>ยังไม่มีการบันทึกข้อมูล</span>
                </div>
            } @else {
                <p-chart type="doughnut" [data]="chartData()" [options]="chartOptions()" [plugins]="chartPlugins" class="block h-full w-full" />
            }
        </div>
    </div>`
})
export class DailyIncidentSummaryWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

    summary = input<DailySummary | null>(null);

    // Set by the dashboard while the stream has not yet delivered a
    // snapshot for the current selection.
    loading = input<boolean>(false);

    // Compared by value, not by reference.
    //
    // The dashboard passes `summary()?.daily_summary ?? null` straight off the
    // SSE stream, so a push that only changed some *other* corner of the board
    // - one new incident in the recent table - still hands this widget a brand
    // new object holding the same three numbers. Read by reference that is a
    // change, which fired the data effect, which called chartData.set(), which
    // had PrimeNG destroy and rebuild the chart: the doughnut resweeping from
    // nothing for a day whose counts had not moved.
    //
    // Fixing it here rather than upstream: the stream is doing its job, and a
    // widget should not repaint for a payload whose contents it has already
    // drawn.
    private readonly counts = computed(() => this.summary(), { equal: sameSummary });

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

    /** Writes the day's total into the hole in the middle of the ring.
     *
     *  Passed to p-chart's `plugins` input rather than registered on Chart
     *  globally, so no other chart on the board grows a number in its centre.
     *
     *  Everything is read at draw time - the figures from the live dataset,
     *  the colours from the document - which means a data push through
     *  refresh() and a dark/light swap both land here without the plugin
     *  needing to be rebuilt or re-registered.
     */
    protected readonly chartPlugins = [
        {
            id: 'centreTotal',
            // After the arcs, so it sits over the ring; before the tooltip, so
            // a tooltip still covers it.
            afterDatasetsDraw: (chart: any) => {
                const arc = chart.getDatasetMeta(0)?.data?.[0];
                if (!arc) return;

                // The arc's own centre, not the canvas centre - the legend
                // along the bottom pushes the ring upwards.
                const { x, y, innerRadius } = arc.getProps(['x', 'y', 'innerRadius'], true);
                if (!innerRadius) return;

                const values: number[] = chart.data?.datasets?.[0]?.data ?? [];
                const total = values.reduce((sum, value) => sum + (value ?? 0), 0);

                const style = getComputedStyle(document.documentElement);
                const family = getComputedStyle(chart.canvas).fontFamily;
                // Sized off the hole rather than fixed, so the number still
                // fits inside the ring on a 264px phone canvas.
                const totalSize = Math.round(innerRadius * 0.68);
                const labelSize = Math.round(innerRadius * 0.2);

                // "ครั้ง" rather than "ทั้งหมด": the card is already titled
                // ผลรวมทั้งหมดต่อวัน, so a unit says something the heading does
                // not, and it matches the wording used in the tooltips.
                const totalText = String(total);
                const unitText = 'รวม';
                const totalFont = `600 ${totalSize}px ${family}`;
                const unitFont = `${labelSize}px ${family}`;

                const ctx = chart.ctx;
                ctx.save();
                ctx.textAlign = 'center';
                // Baselines are positioned explicitly below, so the two lines
                // are placed by their real ink rather than by their em boxes.
                ctx.textBaseline = 'alphabetic';

                // Measure the glyphs instead of guessing at offsets. Thai
                // vowels and tone marks stack well above the nominal line box -
                // ครั้ง carries both ั and ้ - so any spacing derived from the
                // font size alone either collides with the number above or
                // leaves the pair sitting visibly low in the ring. Asking for
                // the actual bounding box gets both lines right, and keeps
                // working when the ring shrinks on a phone.
                ctx.font = totalFont;
                const totalMetrics = ctx.measureText(totalText);
                const totalAscent = totalMetrics.actualBoundingBoxAscent;
                const totalDescent = totalMetrics.actualBoundingBoxDescent;

                ctx.font = unitFont;
                const unitMetrics = ctx.measureText(unitText);
                const unitAscent = unitMetrics.actualBoundingBoxAscent;
                const unitDescent = unitMetrics.actualBoundingBoxDescent;

                const gap = labelSize * 0.5;
                const blockHeight = totalAscent + totalDescent + gap + unitAscent + unitDescent;
                const blockTop = y - blockHeight / 2;

                ctx.fillStyle = style.getPropertyValue('--text-color');
                ctx.font = totalFont;
                ctx.fillText(totalText, x, blockTop + totalAscent);

                ctx.fillStyle = style.getPropertyValue('--text-color-secondary');
                ctx.font = unitFont;
                ctx.fillText(unitText, x, blockTop + totalAscent + totalDescent + gap + unitAscent);

                ctx.restore();
            }
        }
    ];

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
        // tracked signal changes - but `counts` is compared by value, and
        // daily_summary is scoped to the operational *day*, not the shift. So
        // switching shift on the same day delivers a new object holding the
        // same three numbers, the equality check correctly reports "no
        // change", nothing is notified, initChart never runs, and the skeleton
        // put up above stays up forever.
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
            this.counts();
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
        const textMutedColor = documentStyle.getPropertyValue('--text-color-secondary');

        const summary = this.counts();
        const data = [summary?.morning ?? 0, summary?.afternoon ?? 0, summary?.night ?? 0];

        this.chartReady.set(!this.loading() && summary !== null);
        this.isEmpty.set(data.every((value) => value === 0));

        // Grow the arc that changed, rather than resweeping all three from
        // nothing.
        //
        // PrimeNG's `data` setter calls reinit(), which is destroy() + new
        // Chart() - and a brand new chart has no previous state to animate
        // from, so every update replayed the whole entry animation. Chart.js
        // will tween from what is on screen to the new values, but only if the
        // same instance is updated instead of replaced.
        //
        // So on a data-only change the dataset array is swapped inside the
        // live chart and refresh() (chart.update()) is called, leaving the
        // component's `data` input pointing at the same object so the setter
        // never fires. Labels and both colour arrays are fixed at three
        // theme-derived entries, so nothing else has to move.
        //
        // Options changes still go the long way: a theme swap has to rebuild
        // the colours, and it is rare enough that a full replay is fine there.
        const chartComponent = this.chartRef();
        const live = chartComponent?.chart;
        if (!withOptions && live && live.data?.datasets?.length === 1) {
            live.data.datasets[0].data = data;
            chartComponent.refresh();
            return;
        }

        // Borders are painted in the card's own colour rather than a grey, so
        // they read as space between the segments instead of an outline drawn
        // around them - and they stay invisible against the card in either
        // theme without needing a second palette.
        const cardColor = documentStyle.getPropertyValue('--surface-card');

        this.chartData.set({
            labels: ['เช้า', 'บ่าย', 'ดึก'],
            datasets: [
                {
                    data,
                    backgroundColor: [documentStyle.getPropertyValue('--p-primary-600'), documentStyle.getPropertyValue('--p-primary-400'), documentStyle.getPropertyValue('--p-primary-200')],
                    hoverBackgroundColor: [documentStyle.getPropertyValue('--p-primary-500'), documentStyle.getPropertyValue('--p-primary-300'), documentStyle.getPropertyValue('--p-primary-100')],
                    // The gap itself. `spacing` pulls the arcs apart; the
                    // border then thickens that gap and gives each segment a
                    // clean edge, so three shifts read as three pieces rather
                    // than one ring cut with hairlines.
                    spacing: 3,
                    borderWidth: 3,
                    borderColor: cardColor,
                    // Rounded ends, so the gaps look deliberate rather than
                    // like the ring was snapped apart.
                    borderRadius: 6,
                    // Lifts the segment under the cursor out of the ring.
                    // hoverOffset: 14,
                    hoverBorderColor: cardColor,
                    hoverBorderWidth: 3
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
            // The wrapper is already a square sized to the card, so let the
            // canvas fill it instead of re-deriving a size from the doughnut's
            // own 1:1 ratio - that is what left the canvas 60px shorter than
            // its box.
            maintainAspectRatio: false,
            // Required once maintainAspectRatio is false: the canvas then takes
            // its size straight from the container, and chart.js answers a
            // resize with update('resize'), whose transition is duration:0 by
            // default. A chart measured twice as it attaches would lose its
            // entry animation outright - which is exactly what happened to the
            // two bar charts. Same 400ms here, for the same reason.
            transitions: { resize: { animation: { duration: 400, easing: 'easeOutQuart' } } },
            // A thinner ring than the 50% default - it carries the same
            // information in less ink, and it clears the middle for the total.
            cutout: '64%',
            plugins: {
                legend: {
                    // Under the ring, keyed with the same rounded swatches and
                    // muted label colour the hourly chart uses, so a legend
                    // reads the same on every card of the board.
                    position: 'bottom',
                    labels: {
                        color: textMutedColor,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        padding: 16,
                        font: {
                            size: 15 // ปรับขนาดตัวเลขตามที่ต้องการ เช่น 16, 18, 20
                        }
                    }
                },
                tooltip: {
                    // The footer that used to restate the day's total is gone:
                    // the centre of the ring now shows it permanently, so
                    // repeating it in every tooltip was just noise.
                    usePointStyle: true,
                    callbacks: {
                        // "เช้า: 39 ครั้ง" rather than a bare number.
                        label: (item: any) => ` ${item.label}: ${item.parsed} ครั้ง`
                    }
                }
            }
        });
    }
}
