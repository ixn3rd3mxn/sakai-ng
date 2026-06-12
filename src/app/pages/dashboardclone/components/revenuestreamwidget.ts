import { afterNextRender, Component, effect, inject, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LayoutService } from '@/app/layout/service/layout.service';

@Component({
    standalone: true,
    selector: 'app-revenue-stream-widget',
    imports: [ChartModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">CBD เคส 5 อันดับสูงสุด</div>
        <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="h-100" />
    </div>`
})
export class RevenueStreamWidget {
    layoutService = inject(LayoutService);

    chartData = signal<any>(null);

    chartOptions = signal<any>(null);

    constructor() {
        afterNextRender(() => {
            setTimeout(() => {
                this.initChart();
            }, 150);
        });

        effect(() => {
            this.layoutService.layoutConfig().darkTheme;
            setTimeout(() => {
                this.initChart();
            }, 150);
        });
    }

    initChart() {
        const documentStyle = getComputedStyle(document.documentElement);
        const textColor = documentStyle.getPropertyValue('--text-color');
        const borderColor = documentStyle.getPropertyValue('--surface-border');
        const textMutedColor = documentStyle.getPropertyValue('--text-color-secondary');

        this.chartData.set({
            labels: ['CBD1', 'CBD2', 'CBD3', 'CBD4', 'CBD5'],
            datasets: [
                {
                    type: 'bar',
                    label: 'ระดับที่ 1',
                    backgroundColor: documentStyle.getPropertyValue('--p-primary-800'),
                    data: [0, 50, 50, 0, 50],
                    barThickness: 50
                },
                {
                    type: 'bar',
                    label: 'ระดับที่ 2',
                    backgroundColor: documentStyle.getPropertyValue('--p-primary-700'),
                    data: [0, 0, 40, 40, 40],
                    barThickness: 50
                },
                {
                    type: 'bar',
                    label: 'ระดับที่ 3',
                    backgroundColor: documentStyle.getPropertyValue('--p-primary-600'),
                    data: [30, 30, 0, 30, 30],
                    barThickness: 50
                },
                {
                    type: 'bar',
                    label: 'ระดับที่ 4',
                    backgroundColor: documentStyle.getPropertyValue('--p-primary-500'),
                    data: [20, 20, 20, 0, 20],
                    barThickness: 50
                },
                {
                    type: 'bar',
                    label: 'ระดับที่ 5',
                    backgroundColor: documentStyle.getPropertyValue('--p-primary-300'),
                    data: [10, 10, 10, 10, 0],
                    // borderRadius: {
                    //     topLeft: 8,
                    //     topRight: 8,
                    //     bottomLeft: 0,
                    //     bottomRight: 0
                    // },
                    // borderSkipped: false,
                    barThickness: 50
                }
            ]
        });

        this.chartOptions.set({
            maintainAspectRatio: false,
            aspectRatio: 0.8,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: textMutedColor
                    },
                    grid: {
                        color: 'transparent',
                        borderColor: 'transparent'
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: textMutedColor
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
