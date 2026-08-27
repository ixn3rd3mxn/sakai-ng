import { afterNextRender, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { SeverityItem } from '../dispatch.types';

const FALLBACK_LABELS = ['แดง', 'เหลือง', 'เขียว', 'ขาว', 'ดำ'];

@Component({
    standalone: true,
    selector: 'app-severity-statistics',
    imports: [ChartModule, SkeletonModule],
    template: `<div class="card mb-8!">
        <div class="font-semibold text-xl mb-4">สถิติระดับความรุนแรงที่เกิดขึ้น</div>
        @if (!chartReady()) {
            <p-skeleton width="100%" height="25rem" />
        } @else if (isEmpty()) {
            <div class="h-100 flex flex-col items-center justify-center gap-3 text-muted-color">
                <i class="pi pi-chart-bar text-5xl opacity-30"></i>
                <span>ยังไม่มีการบันทึกข้อมูล</span>
            </div>
        } @else {
            <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="h-100" />
        }
    </div>`
})
export class SeverityStatisticsWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

    items = input<SeverityItem[]>([]);

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
            this.items();
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

        const items = this.items();
        const labels = items.length ? items.map((item) => item.severity_name) : FALLBACK_LABELS;
        const data = items.length ? items.map((item) => item.count) : FALLBACK_LABELS.map(() => 0);

        this.chartReady.set(!this.loading());
        this.isEmpty.set(data.every((value) => value === 0));

        this.chartData.set({
            labels,
            datasets: [
                {
                    backgroundColor: [
                        documentStyle.getPropertyValue('--p-primary-600'),
                        documentStyle.getPropertyValue('--p-primary-500'),
                        documentStyle.getPropertyValue('--p-primary-400'),
                        documentStyle.getPropertyValue('--p-primary-300'),
                        documentStyle.getPropertyValue('--p-primary-200')
                    ],
                    data,
                    borderRadius: {
                        topLeft: 0,
                        topRight: 8,
                        bottomLeft: 0,
                        bottomRight: 8
                    },
                    borderSkipped: false,
                    barThickness: 50
                }
            ]
        });

        if (!withOptions) {
            return;
        }

        this.chartOptions.set({
            maintainAspectRatio: false,
            aspectRatio: 0.8,

            indexAxis: 'y',

            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: textMutedColor,
                        precision: 0
                    },
                    grid: {
                        color: borderColor,
                        borderColor: 'transparent',
                        drawTicks: false
                    }
                },
                y: {
                    ticks: {
                        color: textMutedColor
                    },
                    grid: {
                        color: 'transparent',
                        borderColor: 'transparent'
                    }
                }
            }
        });
    }
}
