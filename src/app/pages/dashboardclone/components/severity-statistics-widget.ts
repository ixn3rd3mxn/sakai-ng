import { afterNextRender, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LayoutService } from '@/app/layout/service/layout.service';

@Component({
    standalone: true,
    selector: 'app-severity-statistics',
    imports: [ChartModule],
    template: `<div class="card mb-8!">
        <div class="font-semibold text-xl mb-4">สถิติระดับความรุนแรงที่เกิดขึ้น</div>
        <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="h-100" />
    </div>`
})
export class SeverityStatisticsWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

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
        const borderColor = documentStyle.getPropertyValue('--surface-border');
        const textMutedColor = documentStyle.getPropertyValue('--text-color-secondary');

        this.chartData.set({
            labels: ['แดง', 'เหลือง', 'เขียว', 'ขาว', 'ดำ'],
            datasets: [
                {
                    backgroundColor: [
                        documentStyle.getPropertyValue('--p-primary-600'),
                        documentStyle.getPropertyValue('--p-primary-500'),
                        documentStyle.getPropertyValue('--p-primary-400'),
                        documentStyle.getPropertyValue('--p-primary-300'),
                        documentStyle.getPropertyValue('--p-primary-200')
                    ],
                    data: [40, 35, 30, 27, 17],
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
                        color: textMutedColor
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
