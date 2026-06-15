import { afterNextRender, Component, effect, inject, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LayoutService } from '@/app/layout/service/layout.service';

@Component({
    standalone: true,
    selector: 'app-revenue-stream-widget',
    imports: [ChartModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ผลรวมทั้งหมดต่อวัน</div>
        <div class="flex justify-center">
            <p-chart type="doughnut" [data]="chartData()" [options]="chartOptions()" class="h-90" />
        </div>
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

        this.chartData.set({
            labels: ['เช้า', 'บ่าย', 'ดึก'],
            datasets: [
                {
                    data: [150, 120, 90],
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
