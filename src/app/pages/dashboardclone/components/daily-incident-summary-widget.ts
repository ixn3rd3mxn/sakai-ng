import { afterNextRender, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { DailySummary } from '../dispatch.types';

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
            this.summary();
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
        const textColor = documentStyle.getPropertyValue('--text-color');

        const summary = this.summary();
        const data = [summary?.morning ?? 0, summary?.afternoon ?? 0, summary?.night ?? 0];

        this.chartReady.set(!this.loading());
        this.isEmpty.set(data.every((value) => value === 0));

        this.chartData.set({
            labels: ['เช้า', 'บ่าย', 'ดึก'],
            datasets: [
                {
                    data,
                    backgroundColor: [

                        documentStyle.getPropertyValue('--p-primary-600'),
                        documentStyle.getPropertyValue('--p-primary-500'),
                        documentStyle.getPropertyValue('--p-primary-300')
                    ],
                    hoverBackgroundColor: [

                        documentStyle.getPropertyValue('--p-primary-500'),
                        documentStyle.getPropertyValue('--p-primary-400'),
                        documentStyle.getPropertyValue('--p-primary-200')
                    ]
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
            plugins: {
                legend: {
                    labels: {
                        usePointStyle: true,
                        color: textColor,
                        font: {
                            size: 15 // ปรับขนาดตัวเลขตามที่ต้องการ เช่น 16, 18, 20
                        }
                    }
                }
            }
        });
    }
}
