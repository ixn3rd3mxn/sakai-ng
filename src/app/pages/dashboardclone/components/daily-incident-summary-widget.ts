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

    constructor() {
        afterNextRender(() => {
            this.scheduleInitChart();
        });

        let isFirstRun = true;
        effect(() => {
            this.layoutService.layoutConfig().darkTheme;
            this.summary();
            if (isFirstRun) {
                isFirstRun = false;
                return;
            }
            this.scheduleInitChart();
        });

        this.destroyRef.onDestroy(() => clearTimeout(this.chartTimeoutId));
    }

    private scheduleInitChart() {
        clearTimeout(this.chartTimeoutId);
        this.chartTimeoutId = setTimeout(() => this.initChart(), 150);
    }

    initChart() {
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
