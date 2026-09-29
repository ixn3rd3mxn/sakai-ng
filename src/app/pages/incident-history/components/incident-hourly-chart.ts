import { Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { ChartModule, UIChart } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LayoutService } from '@/app/layout/service/layout.service';
import { IncidentHistoryItem } from '../incident-history.types';

// The operational day, 08:30:00 to the next 08:29:59, in the order it runs:
// เช้า, บ่าย, then ดึก past midnight. Clock hours in the middle - 09:00-09:59
// and so on, as people say them and as /report/manual-dashboard's chart
// has them - with the day's two half hours at the ends: 08:30-08:59 first,
// 08:00-08:29 next morning last. Their labels say they are half hours;
// folding either into a neighbour would make that bar look busier than
// any other.
const SLOT_COUNT = 25;
const pad = (n: number) => `${n}`.padStart(2, '0');

// The slot a "HH:MM:SS" time falls in: 0 for 08:30-08:59, 1 for 09:00-09:59
// ... 23 for 07:00-07:59, 24 for 08:00-08:29; null if it does not parse.
function slotOf(time: string): number | null {
    const [h, m] = time.split(':').map(Number);
    if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m)) return null;
    if (h === 8) return m >= 30 ? 0 : SLOT_COUNT - 1;
    return ((h - 9 + 24) % 24) + 1;
}

// The hour a middle slot covers: 9 for slot 1, 7 for slot 23.
const hourOf = (slot: number) => (slot + 8) % 24;

// The slot's start, as the axis shows it: "08:30", "09:00" ... "08:00".
function startLabel(slot: number): string {
    if (slot === 0) return '08:30';
    if (slot === SLOT_COUNT - 1) return '08:00';
    return `${pad(hourOf(slot))}:00`;
}

// The whole slot, for the tooltip and the busiest line: "08:30–08:59 น.".
function rangeLabel(slot: number): string {
    if (slot === 0) return '08:30–08:59 น.';
    if (slot === SLOT_COUNT - 1) return '08:00–08:29 น.';
    return `${pad(hourOf(slot))}:00–${pad(hourOf(slot))}:59 น.`;
}

const SLOTS = Array.from({ length: SLOT_COUNT }, (_, slot) => slot);

// The five call types, bottom to top of each bar, in the hues the
// dashboard's type cards use (incident-type-stats-widget.ts) so a type is
// one colour wherever it appears: แจ้งเหตุ emerald and แจ้งซ้ำเหตุเดิม in its
// family (cyan, the step that stays distinct from emerald), ปรึกษา violet,
// สายหลุด red, ก่อกวน amber. แจ้งเหตุ sits on the axis so real cases compare
// hour to hour; red and amber are kept apart by violet, since the two
// collapse together for red-green colour blindness. Steps chosen per theme
// and checked for colour-blind separation and contrast on each card
// background (light #ffffff, dark #18181b).
interface TypeColor {
    name: string;
    light: string;
    dark: string;
}
const TYPES: TypeColor[] = [
    { name: 'แจ้งเหตุ', light: '#059669', dark: '#047857' },
    { name: 'แจ้งซ้ำเหตุเดิม', light: '#06b6d4', dark: '#06a2c4' },
    { name: 'สายหลุด', light: '#ef4444', dark: '#ef4444' },
    { name: 'ปรึกษา', light: '#8b5cf6', dark: '#8b5cf6' },
    { name: 'ก่อกวน', light: '#d97706', dark: '#d97706' }
];
// Anything the lookups gain later, or a record with no type, rather than
// dropping it from the hour's total.
const OTHER: TypeColor = { name: 'อื่นๆ', light: '#94a3b8', dark: '#64748b' };
const TYPE_BY_NAME = new Set(TYPES.map((type) => type.name));

const sameSeries = (a: { type: TypeColor; counts: number[] }[], b: { type: TypeColor; counts: number[] }[]) =>
    a.length === b.length && a.every((series, i) => series.type === b[i].type && series.counts.every((n, j) => n === b[i].counts[j]));

// The one-day view's incidents per hour of the day. Counted here from the
// day's incident list, which already carries every incident's hour. Like
// "สถิติจำนวนการใช้บริการตามเวลา" on /report/manual-dashboard, but of the
// incidents recorded, not the calls the phone system saw.
@Component({
    selector: 'app-incident-hourly-chart',
    standalone: true,
    imports: [ChartModule, SkeletonModule],
    template: `
        <div class="card" style="margin-bottom: 0.25rem">
            <div class="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-1 mb-4">
                <div class="font-semibold text-xl">สถิติจำนวนเหตุการณ์ตามเวลา</div>
                @if (!loading() && peak(); as peak) {
                    <div class="text-muted-color">มากที่สุด {{ peak.label }} · {{ peak.count }} ครั้ง</div>
                }
            </div>
            <div style="height: 18rem">
                @if (loading()) {
                    <p-skeleton width="100%" height="100%" />
                } @else {
                    <p-chart type="bar" [data]="chartData()" [options]="chartOptions()" class="block h-full" />
                }
            </div>
        </div>
    `
})
export class IncidentHourlyChart {
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

        // See `draw`. Only the counts and the theme are tracked; what draw
        // reads of the chart on screen is not.
        effect(() => {
            const series = this.counts();
            const theme = this.theme();
            untracked(() => this.draw(series, theme));
        });
    }

    readonly incidents = input<IncidentHistoryItem[]>([]);
    readonly loading = input(false);

    // Per type, per slot. Compared by value: today's day streams, and a push
    // that changed some other part of the page must not rebuild (and
    // re-animate) the chart.
    private readonly counts = computed(
        () => {
            const byType = new Map<string, number[]>();
            for (const incident of this.incidents()) {
                const slot = slotOf(incident.time);
                if (slot === null) continue;
                const type = TYPE_BY_NAME.has(incident.call_type) ? incident.call_type : OTHER.name;
                const row = byType.get(type) ?? new Array<number>(SLOT_COUNT).fill(0);
                row[slot]++;
                byType.set(type, row);
            }
            // Every known type, even at zero, so its legend entry does not
            // come and go; "อื่นๆ" only when something needed it.
            return [...TYPES, ...(byType.has(OTHER.name) ? [OTHER] : [])].map((type) => ({
                type,
                counts: byType.get(type.name) ?? new Array<number>(SLOT_COUNT).fill(0)
            }));
        },
        { equal: sameSeries }
    );

    private readonly totals = computed(() => SLOTS.map((slot) => this.counts().reduce((sum, series) => sum + series.counts[slot], 0)));

    protected readonly peak = computed(() => {
        const totals = this.totals();
        const max = Math.max(...totals);
        return max ? { label: rangeLabel(totals.indexOf(max)), count: max } : null;
    });

    // Set by `draw`, never recomputed on its own: PrimeNG rebuilds the whole
    // chart - and replays its grow-in - whenever this object is replaced.
    protected readonly chartData = signal<any>(null);
    private readonly chartRef = viewChild(UIChart);
    // The theme tick the chart on screen was built for.
    private builtForTheme = -1;

    // A new incident on today's view changes one bar. Rebuilding would regrow
    // all twenty-five from zero every time a call is logged, so the counts are
    // swapped into the chart already on screen and it tweens the one that
    // moved - as the manual board's hourly chart does (hourly-chart-widget.ts).
    // A full build only when there is nothing to update in place: no chart on
    // screen yet, a new theme, or a type appearing (อื่นๆ).
    private draw(series: { type: TypeColor; counts: number[] }[], theme: number): void {
        const component = this.chartRef();
        const live = component?.chart;
        const sameShape =
            theme === this.builtForTheme &&
            live?.data?.datasets?.length === series.length &&
            series.every((s, i) => live.data.datasets[i].label === s.type.name);
        if (component && sameShape) {
            series.forEach((s, i) => (live.data.datasets[i].data = s.counts));
            component.refresh();
            return;
        }
        this.builtForTheme = theme;
        this.chartData.set(this.build(series));
    }

    private build(series: { type: TypeColor; counts: number[] }[]) {
        // From the page, so the fills change with the rest of its colours.
        const dark = document.documentElement.classList.contains('app-dark');
        return {
            labels: SLOTS.map(startLabel),
            datasets: series.map(({ type, counts }) => ({
                label: type.name,
                data: counts,
                backgroundColor: dark ? type.dark : type.light,
                // A plain number, not the { topLeft, topRight } object: on a
                // stacked chart Chart.js then rounds only the top of the whole
                // bar - whichever type ends up there, hidden ones included -
                // and leaves the base and the joins between types square.
                // 4px, as the manual board's hourly chart; 8 on bars this thin
                // reads as round.
                borderRadius: 4,
                stack: 'types',
                maxBarThickness: 32
            }))
        };
    }

    // Depends on the theme alone: replacing the options object rebuilds the
    // chart just as replacing its data does.
    protected readonly chartOptions = computed(() => {
        this.theme();
        const style = getComputedStyle(document.documentElement);
        const borderColor = style.getPropertyValue('--surface-border');
        const textMutedColor = style.getPropertyValue('--text-color-secondary');
        return {
            maintainAspectRatio: false,
            // Hovering anywhere in the column reports the whole hour.
            interaction: { mode: 'index', intersect: false },
            plugins: {
                // Clicking a type hides it - leave only แจ้งเหตุ to see the
                // real cases alone.
                legend: {
                    position: 'bottom',
                    labels: { color: textMutedColor, usePointStyle: true, pointStyle: 'rectRounded', padding: 16 }
                },
                tooltip: {
                    // Every type, zeros included, with its colour, in the order
                    // of the stack - as the manual board's hourly chart lists
                    // รับสาย / ไม่ได้รับสาย. An empty hour reads as a bar of zero.
                    callbacks: {
                        title: (items: any[]) => rangeLabel(items[0]?.dataIndex ?? 0),
                        label: (item: any) => `${item.dataset.label}: ${item.parsed.y} ครั้ง`,
                        // Every type in the hour, hidden ones included - read
                        // off the chart itself, so these options never need
                        // the counts (see above).
                        footer: (items: any[]) => {
                            const item = items[0];
                            if (!item) return '';
                            const total = item.chart.data.datasets.reduce((sum: number, dataset: any) => sum + (dataset.data[item.dataIndex] ?? 0), 0);
                            return `รวม ${total} ครั้ง`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: textMutedColor, maxRotation: 0, autoSkip: true, autoSkipPadding: 12 },
                    grid: { color: 'transparent', borderColor: 'transparent' }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: textMutedColor, precision: 0 },
                    grid: { color: borderColor, borderColor: 'transparent', drawTicks: false }
                }
            }
        };
    });
}
