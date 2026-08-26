import { afterNextRender, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LayoutService } from '@/app/layout/service/layout.service';
import { DailySummary } from '../dispatch.types';

@Component({
    standalone: true,
    selector: 'app-daily-incident-summary',
    imports: [ChartModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ผลรวมทั้งหมดต่อวัน</div>
        <div class="flex justify-center">
            <p-chart type="doughnut" [data]="chartData()" [options]="chartOptions()" class="h-90" />
        </div>
    </div>`
})
export class DailyIncidentSummaryWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

    summary = input<DailySummary | null>(null);

    chartData = signal<any>(null);

    chartOptions = signal<any>(null);

    private chartTimeoutId: ReturnType<typeof setTimeout> | undefined;

    private pendingOptions = false;

    constructor() {
        afterNextRender(() => {
            this.scheduleInitChart(true);
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
