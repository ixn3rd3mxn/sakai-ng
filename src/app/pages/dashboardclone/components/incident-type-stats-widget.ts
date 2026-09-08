import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { IncidentTypeStats } from '../dispatch.types';
import { formatThaiLongDate, formatThaiShortDate } from '../services/date-utils';

interface StatCard {
    label: string;
    count: number;
    diff: number;
    /** A PrimeNG palette name - the card tints with `--p-{color}-500`. */
    color: string;
    /** How much of that colour is mixed into the surface, as a percentage. */
    mix: number;
}

// Remembered per browser, so the machine driving the wall monitor is set once
// instead of on every page load. its own key, not the automate board's: the two
// dashboards are separate screens, and a size set on one has no business
// following the viewer to the other.
const SCALE_KEY = 'dispatch-dashboard.label-scale';

// Tailwind's `lg`. Below it the six cards drop from a sixth of the row to a
// half (col-span-6), so a label that fits at 200% on a wall monitor has a
// fraction of the width to live in and wraps into a mess. Scaling is a
// wall-display affordance; a phone is not one, and neither is a narrow window.
const LARGE_SCREEN = '(min-width: 1024px)';

@Component({
    standalone: true,
    selector: 'app-incident-type-stats',
    imports: [SkeletonModule, ButtonModule, TooltipModule],
    host: {
        // Set on the host so it inherits to every card. The host is
        // display:contents (the page applies `class="contents"`), which does not
        // create a box - but custom properties still inherit through it, so this
        // reaches the labels without wrapping the widget in a real element and
        // breaking its participation in the page's 12-column grid.
        '[style.--label-scale]': 'appliedScale()'
    },
    styles: `
        /* Every card in the row below is tinted - a share of a status colour
           mixed into the surface - and the default skeleton is a 6% white wash
           tuned for a neutral background, which all but disappears on them.
           Tinting with the text colour instead keeps it legible on all five
           card colours and follows the theme, since --text-color flips in dark
           mode. Custom properties inherit, so setting them on .card reaches the
           skeletons without a descendant selector.

           Ordered before .summary-card deliberately: that card carries both
           classes, and equal specificity means the later rule wins - which is
           what lets it keep its own contrast-based override below. */
        .card {
            --p-skeleton-background: color-mix(in srgb, var(--text-color) 12%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--text-color) 28%, transparent);
        }

        /* Each card supplies its own --card-hue and --card-mix; the fill is a
           flat mix of that hue into the surface, in both themes. */
        .tinted-card {
            background: color-mix(in srgb, var(--card-hue) var(--card-mix), var(--surface-card));
        }

        .summary-card {
            background: var(--primary-color);
            color: var(--primary-contrast-color);

            /* This card is filled with --primary-color, where the default
               skeleton - a 6% white wash tuned for neutral surfaces - is
               all but invisible. Tint it with the card's own contrast
               colour instead, which is what its text already uses, so it
               stays legible and follows the theme in both light and dark.
               Custom properties inherit, so setting them here reaches the
               skeletons without needing a descendant selector. */
            --p-skeleton-background: color-mix(in srgb, var(--primary-contrast-color) 22%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--primary-contrast-color) 40%, transparent);
        }

        /* The card labels, sized off a variable rather than a Tailwind step.
           1rem is text-base, the size these were tuned to for a desk monitor;
           the scale only ever grows it.

           line-height is set explicitly because font-size alone would leave the
           label rows cramped as the text grows - Tailwind's text-base carries a
           fixed 1.5rem line-height that does not follow a calc(). */
        .stat-label {
            font-size: calc(1rem * var(--label-scale, 1));
            line-height: 1.4;
        }
    `,
    template: `
        <div class="col-span-12">
            <!-- mb-4, matching the automate board's header row. The page grid is
                 gap-1, so without it the header sits 0.25rem off the cards
                 beneath it and reads as part of the first one. -->
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                <!-- The shift and date the numbers below are for, sitting with
                     the heading they qualify rather than in a full-width band
                     above the board. Lighter than the title and on the same
                     baseline: it answers "which shift" for the row it heads, and
                     is not a second heading. -->
                <div class="flex flex-wrap items-baseline gap-x-2">
                    <span class="font-semibold text-xl">สถิติการให้บริการต่อเวร (Manual)</span>
                    @if (historical()) {
                        <!-- The same line, saying more: on a back-dated board the
                             day is not just context, it is the thing that is easy
                             to forget and act on. Amber text carries that
                             without a full-width band - the wording is the
                             warning, and it is already where the reader is
                             looking.

                             Long form only where it fits. Below lg the header has
                             the width of a phone and shares it with the title, so
                             the short form drops the year and the explanation. -->
                        <span class="text-amber-600 dark:text-amber-400 font-medium">
                            <span class="hidden lg:inline"> กำลังดูแดชบอร์ดวันที่ {{ longDate() }} {{ shiftLabel() }} ลักษณะข้อมูลจะไม่เป็นปัจจุบัน</span>
                            <span class="lg:hidden"> กำลังดูข้อมูลย้อนหลัง: {{ shortDate() }} {{ shiftLabel() }}</span>
                        </span>
                        <!-- The way out, next to the line that says you need one:
                             the same "วันเวลาปัจจุบัน" action the speed dial
                             carries, within reach of the warning instead of two
                             clicks into a menu. pi-refresh matches the dial's
                             entry for it - here "reload the data" is exactly what
                             it does.

                             Only rendered while back-dated, so it is never a
                             button offering to reset to where you already are. -->
                        <p-button
                            icon="pi pi-refresh"
                            severity="warn"
                            [text]="true"
                            [rounded]="true"
                            size="small"
                            pTooltip="กลับไปวันเวลาปัจจุบัน"
                            tooltipPosition="bottom"
                            ariaLabel="กลับไปวันเวลาปัจจุบัน"
                            (onClick)="resetToCurrent.emit()"
                        />
                    } @else {
                        <span class="text-muted-color whitespace-nowrap">{{ shiftLabel() }} {{ longDate() }}</span>
                    }
                </div>
                <!-- Sized for a wall monitor read from across the room, where
                     only the 7xl numbers are legible and the labels are not. The
                     setting is remembered per browser, so the screen on the wall
                     is set once rather than on every page load.

                     Hidden below lg, not disabled. Disabled says "not right
                     now"; here nothing the viewer could do would ever enable it
                     on that device, so it is an irrelevant control rather than a
                     blocked one - and it would be clutter in the header exactly
                     where the header has least room. The title stays either way:
                     it names the row at every width.

                     appliedScale still clamps to 1 below lg, so a size set on a
                     wide screen cannot follow the board into a narrow one and
                     wrap the labels there. -->
                @if (largeScreen()) {
                    <span class="flex items-center gap-1 text-sm text-surface-500 dark:text-surface-400">
                        <p-button
                            icon="pi pi-minus"
                            severity="secondary"
                            [text]="true"
                            [rounded]="true"
                            size="small"
                            ariaLabel="ลดขนาดตัวอักษรหัวข้อ"
                            [disabled]="labelScale() <= MIN_SCALE"
                            (onClick)="scaleDown()"
                        />
                        <span class="tabular-nums text-center" style="min-width: 3rem">{{ scaleLabel() }}</span>
                        <p-button
                            icon="pi pi-plus"
                            severity="secondary"
                            [text]="true"
                            [rounded]="true"
                            size="small"
                            ariaLabel="เพิ่มขนาดตัวอักษรหัวข้อ"
                            [disabled]="labelScale() >= MAX_SCALE"
                            (onClick)="scaleUp()"
                        />
                        <!-- pi-undo, not pi-refresh: refresh on a live board
                             reads as "reload the data", which this does not do. -->
                        <p-button
                            icon="pi pi-undo"
                            severity="secondary"
                            [text]="true"
                            [rounded]="true"
                            size="small"
                            ariaLabel="คืนค่าขนาดตัวอักษรเริ่มต้น"
                            [disabled]="labelScale() === MIN_SCALE"
                            (onClick)="resetScale()"
                        />
                    </span>
                }
            </div>
        </div>
        <div class="col-span-6 lg:col-span-4 xl:col-span-2">
            <!-- h-full so every card in the row is the height of the tallest.
                 These are grid items and stretch already; without it the card
                 inside only grows to its own content, so one label wrapping to a
                 second line leaves the row ragged - which the tints below make
                 obvious in a way six white cards never did. -->
            <div class="card summary-card mb-0 h-full">
                <div class="flex justify-between mb-4">
                    <div>
                        <!-- Full-strength contrast colour, not opacity-80: these
                             are read from across the room, and the 7xl number
                             below already carries the hierarchy the fade was
                             doing. Matches the labels on the automate board. -->
                        <span class="block font-medium mb-4 stat-label">ผลรวมทั้งหมด</span>
                        @if (loading()) {
                            <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                        } @else {
                            <div class="font-medium text-7xl">{{ totalCount() }}</div>
                        }
                    </div>
                </div>
                @if (loading()) {
                    <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                } @else {
                    <div class="text-sm">
                        <span [class]="diffClass(totalDiff())">{{ diffText(totalDiff()) }}</span>
                        <span> เทียบกับเมื่อวาน</span>
                    </div>
                }
            </div>
        </div>
        @for (card of cards(); track card.label) {
            <div class="col-span-6 lg:col-span-4 xl:col-span-2">
                <!-- Only the hue and its strength are per-card; the fill itself
                     lives in .tinted-card. -->
                <div class="card tinted-card mb-0 h-full" [style.--card-hue]="'var(--p-' + card.color + '-500)'" [style.--card-mix]="card.mix + '%'">
                    <div class="flex justify-between mb-4">
                        <div>
                            <!-- Full text colour, not text-muted-color: muted is
                                 a 500-weight grey tuned for a plain surface, and
                                 on a tinted card it goes soft exactly where this
                                 board is read from furthest away. The automate
                                 board's labels carry no muted class either. -->
                            <span class="block font-medium mb-4 stat-label">{{ card.label }}</span>
                            @if (loading()) {
                                <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">{{ card.count }}</div>
                            }
                        </div>
                    </div>
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else {
                        <!-- text-sm: "-105 เทียบกับเมื่อวาน" is the widest this
                             line gets, and at base size it wrapped. -->
                        <div class="text-sm">
                            <span [class]="diffClass(card.diff)">{{ diffText(card.diff) }}</span>
                            <span> เทียบกับเมื่อวาน</span>
                        </div>
                    }
                </div>
            </div>
        }`
})
export class IncidentTypeStatsWidget {
    stats = input<IncidentTypeStats | null>(null);

    // Without this the cards render `?? 0`, which is indistinguishable
    // from a shift that genuinely had no incidents.
    loading = input<boolean>(false);

    // Which shift and day these counts cover, shown beside the heading.
    shift = input<string | null>(null);
    selectedDate = input<Date | undefined>(undefined);

    // Whether that day is a back-dated one rather than the live board, which
    // turns the same line from a caption into a warning.
    historical = input<boolean>(false);

    // Emitted rather than handled here: the day/shift selection lives in
    // DispatchDataService, which the page owns and this widget - inputs only,
    // no injected state - deliberately does not reach into.
    resetToCurrent = output<void>();

    protected readonly shiftLabel = computed(() => this.shift() || '-');
    protected readonly longDate = computed(() => formatThaiLongDate(this.selectedDate()));
    protected readonly shortDate = computed(() => formatThaiShortDate(this.selectedDate()));

    // 1 is text-base, the size the labels were tuned to, so the default is
    // exactly today's board. The ceiling is 2x: past that a label out-sizes the
    // number it belongs to, and the six-column row starts wrapping
    // "แจ้งซ้ำเหตุเดิม" - the longest of the six - onto a third line.
    protected readonly MIN_SCALE = 1;
    protected readonly MAX_SCALE = 2;
    private static readonly STEP = 0.25;

    // The stored preference, which is not necessarily what is rendered.
    protected readonly labelScale = signal(readStoredScale());

    protected readonly largeScreen = signal(matchesLargeScreen());

    /** What actually reaches the CSS.
     *
     *  Hiding the buttons below `lg` stops the scale being *raised* there, but
     *  on its own it would not stop the problem: the preference is remembered
     *  per browser, so a window resized narrow - or a desktop profile opened on
     *  a smaller screen - would keep applying whatever was set while it was
     *  wide, which is the wrapping this is meant to avoid. Clamping what is
     *  applied, while leaving the stored value alone, means the wall setting
     *  comes back intact the moment the window is wide again.
     */
    protected readonly appliedScale = computed(() => (this.largeScreen() ? this.labelScale() : this.MIN_SCALE));

    // Reads the applied value, not the stored one, so the number on screen
    // always describes the text on screen.
    protected readonly scaleLabel = computed(() => `${Math.round(this.appliedScale() * 100)}%`);

    constructor() {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const query = window.matchMedia(LARGE_SCREEN);
        const onChange = (event: MediaQueryListEvent) => this.largeScreen.set(event.matches);
        query.addEventListener('change', onChange);
        inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }

    protected scaleUp(): void {
        this.setScale(this.labelScale() + IncidentTypeStatsWidget.STEP);
    }

    protected scaleDown(): void {
        this.setScale(this.labelScale() - IncidentTypeStatsWidget.STEP);
    }

    /** Straight back to the default, rather than stepping down four times. */
    protected resetScale(): void {
        this.setScale(this.MIN_SCALE);
    }

    private setScale(value: number): void {
        const clamped = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, Number(value.toFixed(2))));
        this.labelScale.set(clamped);
        try {
            localStorage.setItem(SCALE_KEY, `${clamped}`);
        } catch {
            // Private windows and locked-down kiosk profiles throw on write.
            // The size still applies for this session; it just is not
            // remembered, which is a far better outcome than failing to set it.
        }
    }

    private byName = computed(() => {
        const map = new Map<string, { count: number; diff: number }>();
        for (const item of this.stats()?.items ?? []) {
            map.set(item.call_name, { count: item.count, diff: item.diff });
        }
        return map;
    });

    totalCount = computed(() => this.stats()?.total.count ?? 0);
    totalDiff = computed(() => this.stats()?.total.diff ?? 0);

    // Label, colour, and how strong a tint each card carries - the one place
    // the five call types are bound to what is on screen. The label doubles as
    // the lookup key into `byName`, which is how it worked before the colours
    // arrived.
    //
    // Assigned by what a call costs the centre, not by giving five categories
    // five hues:
    //
    //   สายหลุด (red)    - the one outcome that may mean nobody was helped.
    //   ก่อกวน (amber)   - real time spent on a call that was never an emergency.
    //   ปรึกษา (violet)  - genuinely other; violet carries no verdict, and the
    //                      automate board uses it for โทรออก for the same reason.
    //   แจ้งเหตุ +        - one hue at two strengths, because a repeat report is
    //   แจ้งซ้ำเหตุเดิม    a report: the colour says "same family" rather than
    //   (teal 40/20)      distinguishing them. Teal, not green, on purpose -
    //                     these two are the centre's core demand, and green
    //                     would call a busy shift a good one. The automate board
    //                     keeps call volume neutral for exactly this reason.
    //
    // Teal also stays clear of the solid --primary-color on the total card,
    // which defaults to blue (see LayoutService).
    // 55% is as strong as these tints can go. Past it dark mode gives out:
    // at 70% an amber card leaves its white text at 3.8:1 and teal at 4.3:1,
    // both under the 4.5:1 minimum. At 55% the worst case on either theme is
    // 5.3:1, against 13:1 at the 40% this started from - so this is the most
    // colour the row can carry and still be read from across the room.
    private static readonly CARDS: { label: string; color: string; mix: number }[] = [
        { label: 'แจ้งเหตุ', color: 'teal', mix: 55 },
        { label: 'แจ้งซ้ำเหตุเดิม', color: 'teal', mix: 25 },
        { label: 'ปรึกษา', color: 'violet', mix: 55 },
        { label: 'สายหลุด', color: 'red', mix: 55 },
        { label: 'ก่อกวน', color: 'amber', mix: 55 }
    ];

    cards = computed<StatCard[]>(() => {
        const map = this.byName();
        return IncidentTypeStatsWidget.CARDS.map(({ label, color, mix }) => ({
            label,
            color,
            mix,
            ...(map.get(label) ?? { count: 0, diff: 0 })
        }));
    });

    // No colour on this number, only weight - and that is a legibility fix, not
    // a style choice.
    //
    // Red and green text stopped working the moment the cards were tinted,
    // because a red card is exactly where a red number lands: text-red-500 came
    // out at 2.26:1 on the teal card and 1.02:1 on the solid blue total, which
    // is invisible. No shade of red rescues it either - red-800, the darkest
    // that still reads as red, peaks at 3.90:1 against the red สายหลุด card,
    // still under the 4.5:1 floor. Red on red has nowhere to go.
    //
    // So direction is carried by the sign that is already printed, and the
    // number takes the card's own text colour: 8.4:1 at worst in light mode,
    // 7.5:1 in dark. The categorical meaning lives in the card colour now,
    // which is where this board puts it.
    diffClass(diff: number): string {
        return diff === 0 ? 'font-medium' : 'font-black';
    }

    diffText(diff: number): string {
        return diff > 0 ? `+${diff}` : `${diff}`;
    }
}

/** The remembered scale, or 1 when there is nothing usable stored.
 *
 *  Guarded because reading localStorage throws outright in some contexts (a
 *  private window, a browser configured to block site data), and a board that
 *  refuses to render because it could not read a font preference would be a
 *  poor trade.
 */
function readStoredScale(): number {
    try {
        const stored = Number(localStorage.getItem(SCALE_KEY));
        // Also rejects NaN, which is what Number(null) of a missing key gives.
        return stored >= 1 && stored <= 2 ? stored : 1;
    } catch {
        return 1;
    }
}

/** Whether the viewport is at least Tailwind's `lg`. False during SSR or in any
 *  context without matchMedia, which is the safe default: no scaling. */
function matchesLargeScreen(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(LARGE_SCREEN).matches;
}
