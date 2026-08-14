import { afterNextRender, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LayoutService } from '@/app/layout/service/layout.service';
import { CbdItem } from '../dispatch.types';

@Component({
    standalone: true,
    selector: 'app-frequent-cbd-cases',
    imports: [ChartModule],
    template: `<div class="card mb-8!">
        <div class="font-semibold text-xl mb-4">เคส CBD ที่เกิดเหตุบ่อยที่สุด</div>
        <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="h-100" />
    </div>`
})
export class FrequentCbdCasesWidget {
    layoutService = inject(LayoutService);
    private destroyRef = inject(DestroyRef);

    items = input<CbdItem[]>([]);

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
            this.items();
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

        const items = this.items();
        const palette = [documentStyle.getPropertyValue('--p-primary-600'), documentStyle.getPropertyValue('--p-primary-500'), documentStyle.getPropertyValue('--p-primary-400'), documentStyle.getPropertyValue('--p-primary-300'), documentStyle.getPropertyValue('--p-primary-200')];

        this.chartData.set({
            labels: items.map((item) => item.cbd_name),
            datasets: [
                {
                    backgroundColor: items.map((_, index) => palette[index % palette.length]),
                    data: items.map((item) => item.count),
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

        this.chartOptions.set({
            maintainAspectRatio: false,
            aspectRatio: 0.8,

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
                        color: 'transparent',
                        borderColor: 'transparent'
                    }
                },
                y: {
                    ticks: {
                        color: textMutedColor,
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
