import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { parseIsoDate } from '../../dashboardclone/services/date-utils';
import { TopDayItem } from '../incident-history.types';

interface Bucket {
    label: string;
    title: string;
    count: number;
}

// Up to this many days a bar per day still reads; past it the bars thin to
// slivers, so an unbroken range is grouped - by week up to about half a
// year, by month beyond that.
const DAILY_MAX = 45;
const WEEKLY_MAX = 190;

const pad = (n: number) => `${n}`.padStart(2, '0');
const dayMonth = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const longDay = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

// The headline card of the summary page's several-days view: how many
// incidents, and how they spread across the days asked about. Only shown in
// that view - one day already has its own per-shift columns.
@Component({
    selector: 'app-incident-range-trend',
    standalone: true,
    imports: [ChartModule, SkeletonModule, DecimalPipe],
    template: `
        <div class="card" style="margin-bottom: 0.25rem">
            <div class="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-1 mb-4">
                <div class="font-semibold text-xl">จำนวนเหตุการณ์ตามช่วงเวลา</div>
                @if (!loading()) {
                    <div class="text-muted-color">
                        รวม {{ total() | number }} ครั้ง · {{ days().length }} วัน
                    </div>
                }
            </div>
            <div style="height: 18rem">
                @if (loading()) {
                    <p-skeleton width="100%" height="100%" />
                } @else {
                    <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="block h-full" />
                }
            </div>
            @if (!loading() && groupingNote()) {
                <div class="text-sm text-muted-color mt-3">{{ groupingNote() }}</div>
            }
        </div>
    `
})
export class IncidentRangeTrend {
    private readonly layoutService = inject(LayoutService);

    // Colours are read from the page's CSS, which only has its new values a
    // moment after the theme signal flips - read at once, a light chart kept
    // dark gridlines and dark gaps. Settled on the same 150ms as the manual
    // board's hourly chart (hourly-chart-widget.ts).
    private readonly theme = signal(0);

    constructor() {
        let first = true;
        effect((onCleanup) => {
            this.layoutService.layoutConfig().darkTheme;
            if (first) {
                first = false;
                return;
            }
            const timer = setTimeout(() => this.theme.update((n) => n + 1), 150);
            onCleanup(() => clearTimeout(timer));
        });
    }

    // Every chosen day, zero days included, oldest first.
    readonly days = input<TopDayItem[]>([]);
    // Separate days picked one by one are drawn a bar each whatever their
    // number: grouping them into weeks would invent days nobody asked about.
    readonly continuous = input(true);
    readonly loading = input(false);

    protected readonly total = computed(() => this.days().reduce((sum, day) => sum + day.count, 0));

    private readonly grouping = computed<'day' | 'week' | 'month'>(() => {
        const n = this.days().length;
        if (!this.continuous() || n <= DAILY_MAX) return 'day';
        return n <= WEEKLY_MAX ? 'week' : 'month';
    });

    protected readonly groupingNote = computed(() => {
        switch (this.grouping()) {
            case 'week':
                return 'แต่ละแท่งคือ 7 วัน นับจากวันแรกของช่วง';
            case 'month':
                return 'แต่ละแท่งคือ 1 เดือน';
            default:
                return '';
        }
    });

    private readonly buckets = computed<Bucket[]>(() => {
        const days = this.days().map((day) => ({ date: parseIsoDate(day.operational_day), count: day.count }));
        switch (this.grouping()) {
            case 'day':
                return days.map(({ date, count }) => ({ label: dayMonth(date), title: longDay(date), count }));
            case 'week': {
                // Runs of seven from the first day, so every bar but perhaps
                // the last covers the same number of days.
                const buckets: Bucket[] = [];
                for (let i = 0; i < days.length; i += 7) {
                    const run = days.slice(i, i + 7);
                    const first = run[0].date;
                    const last = run[run.length - 1].date;
                    buckets.push({
                        label: `${dayMonth(first)}–${dayMonth(last)}`,
                        title: `${longDay(first)} – ${longDay(last)}`,
                        count: run.reduce((sum, day) => sum + day.count, 0)
                    });
                }
                return buckets;
            }
            case 'month': {
                const byMonth = new Map<string, Bucket>();
                for (const { date, count } of days) {
                    const key = `${date.getFullYear()}-${date.getMonth()}`;
                    const bucket = byMonth.get(key) ?? {
                        label: date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }),
                        title: date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
                        count: 0
                    };
                    bucket.count += count;
                    byMonth.set(key, bucket);
                }
                return [...byMonth.values()];
            }
        }
    });

    // Colours are read from the document, so both are rebuilt on a theme
    // swap. The data is a one-off answer, never a stream, so rebuilding the
    // chart costs one animation and nothing else.
    protected readonly chartData = computed(() => {
        this.theme();
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--p-primary-color');
        const buckets = this.buckets();
        return {
            labels: buckets.map((bucket) => bucket.label),
            datasets: [
                {
                    label: 'จำนวนเหตุการณ์',
                    data: buckets.map((bucket) => bucket.count),
                    backgroundColor: primary,
                    borderRadius: 4,
                    maxBarThickness: 48
                }
            ]
        };
    });

    protected readonly chartOptions = computed(() => {
        this.theme();
        const style = getComputedStyle(document.documentElement);
        const borderColor = style.getPropertyValue('--surface-border');
        const textMutedColor = style.getPropertyValue('--text-color-secondary');
        const buckets = this.buckets();
        return {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                // One series: the card's title already names it.
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (items: any[]) => buckets[items[0]?.dataIndex]?.title ?? '',
                        label: (item: any) => `${item.parsed.y} ครั้ง`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: textMutedColor, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
                    grid: { color: 'transparent', borderColor: 'transparent' }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: textMutedColor, precision: 0 },
                    grid: { color: borderColor, borderColor: 'transparent', drawTicks: false }
                }
            }
        };
    });
}
