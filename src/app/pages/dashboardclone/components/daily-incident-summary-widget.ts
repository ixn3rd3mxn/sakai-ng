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
        <div class="flex justify-center">
            @if (!chartReady()) {
                <!-- Boxed to the chart's own h-90 so finishing the load does not
                     resize the card; the circle itself stays 20rem. -->
                <div class="h-90 flex items-center justify-center">
                    <p-skeleton width="20rem" height="20rem" shape="circle" />
                </div>
            } @else if (isEmpty()) {
                <div class="h-90 flex flex-col items-center justify-center gap-3 text-muted-color">
                    <i class="pi pi-chart-pie text-5xl opacity-30"></i>
                    <span>ยังไม่มีการบันทึกข้อมูล</span>
                </div>
            } @else {
                <p-chart type="doughnut" [data]="chartData()" [options]="chartOptions()" class="h-90" />
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

    constructor() {
        afterNextRender(() => {
            this.scheduleInitChart(true);
        });

        // Hide the chart the moment a new selection starts loading. Without
        // this the canvas keeps showing the previous shift's figures until
        // the rebuild lands, which is the same "confident but wrong" state
        // the skeletons exist to prevent - just harder to notice, because it
        // is real data under the wrong heading.
        effect(() => {
            if (this.loading()) {
                this.chartReady.set(false);
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

        this.chartData.set({
            labels: ['เช้า', 'บ่าย', 'ดึก'],
            datasets: [
                {
                    data,
                    backgroundColor: [documentStyle.getPropertyValue('--p-primary-600'), documentStyle.getPropertyValue('--p-primary-500'), documentStyle.getPropertyValue('--p-primary-300')],
                    hoverBackgroundColor: [documentStyle.getPropertyValue('--p-primary-500'), documentStyle.getPropertyValue('--p-primary-400'), documentStyle.getPropertyValue('--p-primary-200')]
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
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
                    callbacks: {
                        // The total is the one number the ring does not state
                        // outright, and it is the headline for the day.
                        footer: (items: any[]) => `รวมทั้งหมด ${((items[0]?.dataset?.data ?? []) as number[]).reduce((sum, value) => sum + (value ?? 0), 0)}`
                    }
                }
            }
        });
    }
}
