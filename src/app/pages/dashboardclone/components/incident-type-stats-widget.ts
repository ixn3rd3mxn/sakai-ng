import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { IncidentBreakdowns, IncidentTypeStats } from '../dispatch.types';
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

// แจ้งเหตุ's fill, defined once. The breakdown row borrows it verbatim so those
// five cards read as belonging to that card rather than as a group of their
// own - which is the only thing marking the relationship now that the row
// carries no heading. Stated here rather than repeated in the template so the
// two cannot drift apart: recolour แจ้งเหตุ and the breakdown follows.
// emerald, matching รับสาย on the manual board. Both boards mix at 55%, so the
// two used to differ only in hue - teal here against emerald there - which read
// as an accident rather than a distinction.
const FEATURE_TINT = { color: 'emerald', mix: 55 };

// Font Awesome class per breakdown row, keyed on the lowercased name the
// backend sends. A name with no entry - a reporting channel added to the lookup
// table later - renders without an icon rather than breaking the card, which is
// why this is a lookup with a fallback and not a required field.
const BREAKDOWN_ICONS: Record<string, string> = {
    '1669': 'fa-solid fa-headset',
    '2nd': 'fa-solid fa-phone',
    วิทยุ: 'fa-solid fa-walkie-talkie',
    trauma: 'fa-solid fa-user-injured',
    'non-trauma': 'fa-solid fa-heart-crack'
};

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

            /* Kills .card's margin-bottom: 2rem.

               The Tailwind mb-0 in the template never applied: .card is
               unlayered while utilities live in @layer utilities, and unlayered
               author styles outrank layered ones no matter the source order. So
               every card except a grid's :last-child - which .card:last-child
               exempts - carried 32px of bottom margin, which is the gap under
               each row here. Component styles are unlayered too and Angular's
               scoping attribute adds specificity, so this wins cleanly without
               !important. Spacing comes from the grid gap instead.

               Same fix as agent-status-widget on the automate board. */
            margin-bottom: 0;
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
            font-size: calc(var(--label-base, 1rem) * var(--label-scale, 1));
            line-height: 1.4;
        }

        /* Row 2 one step down: 0.875rem is text-sm against the row above's
           text-base. Only the base moves - the +/- control still multiplies
           both rows by the same --label-scale, so the two stay a step apart at
           every setting instead of the gap widening as the wall size goes up.

           Applied alongside .stat-label rather than replacing it, so the shared
           line-height stays in one place. */
        .stat-label-sm {
            --label-base: 0.875rem;
        }

        /* The backdrop glyph on the breakdown cards.

           isolation: isolate is the load-bearing part. It makes the card a
           stacking context, which is what lets the icon's z-index: -1 land
           *behind the card's text but in front of the card's own background*.
           Without it the negative index would drop the icon behind that
           background and it would simply not be visible. */
        .icon-card {
            position: relative;
            isolation: isolate;
            overflow: hidden;

            /* Makes the card its own sizing reference, so the glyph below can be
               measured against this card's width rather than the root font. */
            container-type: inline-size;
        }

        .stat-icon {
            position: absolute;

            /* -1, not 0. Painting order inside this card's stacking context runs
               card background, then negative z-index children, then the static
               text, then positioned children at 0/auto - so at 0 the glyph lands
               *on top of* the number. -1 puts it behind the text and in front of
               the fill, which is the whole reason .icon-card isolates. */
            z-index: -1;
            right: 0.5rem;
            top: 50%;
            transform: translateY(-50%);

            /* Sized against the card, not the root font. A fixed 5rem is 80px
               whatever happens, so at 150% display scaling - or on a phone - the
               card narrows while the glyph does not, and it starts crowding the
               digits. 34cqw is 34% of this card's own width, so it tracks the
               card at every zoom level and breakpoint; the clamp stops it
               vanishing on a very narrow card or dwarfing a very wide one. */
            font-size: clamp(2rem, 34cqw, 5rem);

            /* Inherits the card's text colour, so it follows the theme rather
               than needing a light and a dark value, and sits low enough to stay
               clear of the contrast floor where text and glyph overlap. */
            opacity: 0.3;
            pointer-events: none;
        }

        /* Gone below Tailwind's sm. There the breakdown grids drop to two and
           three across on a phone, so each card is a couple of inches wide and
           holding a label, a number and a backdrop glyph - the glyph is the only
           one of the three that is decoration, so it is the one that goes.

           639.98px rather than 640px: the sm utilities take effect at 640px
           exactly, and a whole-pixel max-width would leave both rules matching
           on a 640px-wide viewport. */
        @media (max-width: 639.98px) {
            .stat-icon {
                display: none;
            }
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
        }

        <!-- The แจ้งเหตุ count cut two ways: by how the call reached the centre,
             and by type of illness. Each group sums to the แจ้งเหตุ card above -
             the backend records a channel and a case for that call type only,
             and requires both when it does.

             Wearing แจ้งเหตุ's own fill, and set a size down from it, so the two
             read as one group without a heading saying so.

             The two columns below are siblings in the page's twelve-column
             grid, so they stretch to a common height on their own - the right
             column needs no explicit row-span to line up with the left.

             The panels themselves arrive by projection rather than being
             rendered here. That keeps this widget the owner of the section's
             layout, which is a fair criticism of it - but it is what lets the
             breakdown cards sit inside the left column *above* a panel the page
             supplies, and it keeps them inside this component's DOM, where
             --label-scale still reaches them from the host. Rendered as a
             separate component elsewhere in the tree they would stop scaling
             with the +/- control. -->

        <!-- min-w-0 is load-bearing, not tidying. A grid item defaults to
             min-width:auto, so it cannot shrink below its content's min-content
             width - and this column holds the บันทึกล่าสุด table, whose four
             min-width:7rem headers add up to 28rem. That pushed the column
             wider than its share, and worse, the width *moved* when the
             skeleton rows became real text and the paginator appeared. The
             CBD chart below mounts at exactly that moment, and it sets
             maintainAspectRatio:false, so it takes its canvas size straight
             from the column: the width change fired a resize, chart.js
             answered with update('resize'), and that transition is duration:0
             - so the bars snapped to full height and the entry animation was
             lost. Letting the column shrink pins its width, and the table
             scrolls inside it (responsiveLayout="scroll") as intended. -->
        <div class="col-span-12 xl:col-span-6 min-w-0 flex flex-col gap-1">
            <!-- Placeholders while connecting, then the real rows.

                 These loops run over the payload, not over a static table like
                 the row above - so before the first snapshot arrives there are
                 no rows, the loop body never runs, and the cards simply are not
                 there. That left this block empty while loading and the page
                 jumped as it filled in. The counts here are the shape the
                 lookup tables have today: three channels, two case types.

                 The placeholder boxes have to match the real card to the pixel
                 or the jump comes back smaller instead of going away. A real
                 card measures 99.6px: 32 of .card padding, a 19.6 label line
                 box (0.875rem at line-height 1.4), 8 of mb-2, and a 40px
                 text-4xl line box.

                 So the label skeleton is wrapped in the same stat-label-sm span
                 the real label uses and sized 1.4em - its own line height,
                 expressed in em so it tracks the +/- control rather than
                 needing a fixed value that would drift at 200%. The value
                 skeleton is 2.5rem, which is text-4xl's line box. -->

            <div class="grid grid-cols-3 gap-1">
                @if (loading()) {
                    @for (placeholder of CHANNEL_PLACEHOLDERS; track placeholder) {
                        <div class="card tinted-card mb-0 h-full" [style.--card-hue]="'var(--p-' + featureTint.color + '-500)'" [style.--card-mix]="featureTint.mix + '%'">
                            <span class="block mb-2 stat-label stat-label-sm"><p-skeleton width="min(4rem, 100%)" height="1.4em" /></span>
                            <p-skeleton width="min(3rem, 100%)" height="2.5rem" />
                        </div>
                    }
                } @else {
                    @for (row of channelRows(); track row.name) {
                        <div class="card tinted-card icon-card mb-0 h-full" [style.--card-hue]="'var(--p-' + featureTint.color + '-500)'" [style.--card-mix]="featureTint.mix + '%'">
                            @if (icon(row.name); as glyph) {
                                <i [class]="'stat-icon ' + glyph" aria-hidden="true"></i>
                            }
                            <span class="block font-medium mb-2 stat-label stat-label-sm">{{ row.name }}</span>
                            <div class="text-surface-900 dark:text-surface-0 font-medium text-4xl">{{ row.count }}</div>
                        </div>
                    }
                }
            </div>
            <div class="grid grid-cols-2 gap-1">
                @if (loading()) {
                    @for (placeholder of CASE_PLACEHOLDERS; track placeholder) {
                        <div class="card tinted-card mb-0 h-full" [style.--card-hue]="'var(--p-' + featureTint.color + '-500)'" [style.--card-mix]="featureTint.mix + '%'">
                            <span class="block mb-2 stat-label stat-label-sm"><p-skeleton width="min(6rem, 100%)" height="1.4em" /></span>
                            <p-skeleton width="min(3rem, 100%)" height="2.5rem" />
                        </div>
                    }
                } @else {
                    @for (row of caseRows(); track row.name) {
                        <div class="card tinted-card icon-card mb-0 h-full" [style.--card-hue]="'var(--p-' + featureTint.color + '-500)'" [style.--card-mix]="featureTint.mix + '%'">
                            @if (icon(row.name); as glyph) {
                                <i [class]="'stat-icon ' + glyph" aria-hidden="true"></i>
                            }
                            <span class="block font-medium mb-2 stat-label stat-label-sm">{{ row.name }}</span>
                            <div class="text-surface-900 dark:text-surface-0 font-medium text-4xl">{{ row.count }}</div>
                        </div>
                    }
                }
            </div>
            <ng-content select="[leftPanel]" />
        </div>

        <!-- Same treatment as the left column. Nothing in here pushes on the
             width today, so this is insurance rather than a fix - but the two
             columns should not differ in whether they can be widened by their
             contents. -->
        <div class="col-span-12 xl:col-span-6 min-w-0">
            <ng-content select="[rightPanel]" />
        </div>`
})
export class IncidentTypeStatsWidget {
    stats = input<IncidentTypeStats | null>(null);

    // Without this the cards render `?? 0`, which is indistinguishable
    // from a shift that genuinely had no incidents.
    loading = input<boolean>(false);

    // The แจ้งเหตุ count cut by channel and by case type. Null until the first
    // payload lands, same as `stats`.
    breakdowns = input<IncidentBreakdowns | null>(null);

    /** แจ้งเหตุ's own fill, which the whole breakdown row wears. */
    protected readonly featureTint = FEATURE_TINT;

    /** Placeholder cards for the breakdown grids while the first payload is in
     *  flight - the values are never read, only the counts matter. Three and
     *  two, matching the lookup tables as they stand; if a channel is added the
     *  row will be one skeleton short for the second it takes to connect, which
     *  is a far smaller problem than the row not being there at all. */
    protected readonly CHANNEL_PLACEHOLDERS = [0, 1, 2];
    protected readonly CASE_PLACEHOLDERS = [0, 1];

    /** Font Awesome classes for a breakdown card's backdrop glyph, or '' when
     *  the name has no entry - which renders no icon rather than an empty box.
     *  Matched case-insensitively: the dialog's options are lower case while
     *  the lookup table returns "Trauma" and "Non-Trauma". */
    protected icon(name: string): string {
        return BREAKDOWN_ICONS[name.trim().toLowerCase()] ?? '';
    }

    // Straight through from the payload - the backend already emits every entry
    // in the lookup, at zero when nothing was recorded, so the row keeps its
    // shape through a shift instead of reshuffling as counts arrive.
    protected readonly channelRows = computed(() => this.breakdowns()?.reporting_channel ?? []);
    protected readonly caseRows = computed(() => this.breakdowns()?.case_type ?? []);

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
    //   (emerald 55/25)   distinguishing them.
    //
    // This pair was teal, chosen so a green would not read as "a busy shift is
    // a good shift". It is emerald now to match รับสาย on the manual board,
    // which is the same green and also a neutral-polarity count - so that board
    // had already settled the question the other way, and two boards agreeing
    // is worth more than the distinction was.
    // 55% is as strong as these tints can go. Past it dark mode gives out:
    // at 70% an amber card leaves its white text at 3.8:1 and teal at 4.3:1,
    // both under the 4.5:1 minimum. At 55% the worst case on either theme is
    // 5.3:1, against 13:1 at the 40% this started from - so this is the most
    // colour the row can carry and still be read from across the room.
    private static readonly CARDS: { label: string; color: string; mix: number }[] = [
        { label: 'แจ้งเหตุ', color: FEATURE_TINT.color, mix: FEATURE_TINT.mix },
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
