import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SkeletonModule } from 'primeng/skeleton';
import { CallStatsDiff, CallStatsSummary, CallTimes } from '../call-stats.types';
import { CallStatsDataService } from '../services/call-stats-data.service';
import { parseIsoDate } from '../../dashboardclone/services/date-utils';
import { formatDuration } from '../format-utils';

/** Whether a rise in this metric is an improvement, a deterioration, or
 *  neither. It is the metric's property, not the card's, which is why every
 *  entry in CARDS and TIME_CARDS declares one. */
type Polarity = 'up-good' | 'down-good' | 'neutral';

interface StatCard {
    label: string;
    value: string;
    color: string;
    /** null when there is no comparison to show - see CallStatsSummary.diff. */
    diff: number | null;
    polarity: Polarity;
    /** Painted with the solid theme primary rather than a tint - the "total"
     *  card, matching ผลรวมทั้งหมด on /report/dashboard. */
    solid?: boolean;
}

// Remembered per browser, so the machine driving the wall monitor is set once
// instead of on every page load. Scoped to this widget rather than the app: a
// desk user and the wall screen are different viewers of the same board and
// want different answers.
const SCALE_KEY = 'automate-dashboard.label-scale';

// Tailwind's `lg`. Below it the six counter cards drop from a sixth of the row
// to a half (col-span-6), and the four duration cards do the same - so a label
// that fits at 200% on a wall monitor has a fraction of the width to live in
// and wraps into a mess. Scaling is a wall-display affordance; a phone is not
// one, and neither is a narrow window.
const LARGE_SCREEN = '(min-width: 1024px)';

// `th-TH` resolves to the Buddhist calendar, so this renders e.g.
// "28 สิงหาคม พ.ศ. 2569" without a hand-maintained month/era table.
const THAI_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

@Component({
    standalone: true,
    selector: 'app-call-stats-widget',
    imports: [SkeletonModule, ProgressSpinnerModule, ButtonModule],
    host: {
        // Set on the host so it inherits to every card. The host is
        // display:contents (the page applies `class="contents"`), which does not
        // create a box - but custom properties still inherit through it, so this
        // reaches the labels without wrapping the widget in a real element and
        // breaking its participation in the page's 12-column grid.
        '[style.--label-scale]': 'appliedScale()'
    },
    styles: `
        /* Every card here is tinted - 40% of a status colour mixed into the
           surface - and the default skeleton is a 6% white wash tuned for a
           neutral background, which all but disappears on them. Tinting with
           the text colour instead keeps it legible on all five card colours
           and follows the theme, since --text-color flips in dark mode.
           Custom properties inherit, so setting them on .card reaches the
           skeletons without a descendant selector. */
        .card {
            --p-skeleton-background: color-mix(in srgb, var(--text-color) 12%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--text-color) 28%, transparent);
        }

        /* Each card sets its own --card-hue; the strength is shared, which is
           why it is stated once here rather than twice in the template.

           55%, matching /report/dashboard's cards - it was 40%, which read as
           washed out beside them. This is as far as it goes: the labels and
           numbers stay at 8.4:1 in light mode and 5.3:1 in dark (the amber
           duration cards are the floor), and past 55% the dark theme drops
           under the 4.5:1 minimum. */
        .tinted-card {
            background: color-mix(in srgb, var(--card-hue) 55%, var(--surface-card));
        }

        /* The total card, solid rather than tinted - the same treatment
           ผลรวมทั้งหมด gets on /report/dashboard, so both boards say "the total
           is the solid one" as a rule rather than by coincidence.

           --primary-color, not --p-blue-500. The theme primary is configurable
           (LayoutService defaults it to blue), so hardcoding blue would hold
           only until somebody changed it, and the two boards would then drift
           apart again - which is the whole thing this is fixing.

           Ordered after .card so its skeleton overrides win: the shared ones
           above tint with --text-color, which is near-invisible on a saturated
           fill, so this card tints with its own contrast colour instead. */
        .summary-card {
            background: var(--primary-color);
            color: var(--primary-contrast-color);

            --p-skeleton-background: color-mix(in srgb, var(--primary-contrast-color) 22%, transparent);
            --p-skeleton-animation-background: color-mix(in srgb, var(--primary-contrast-color) 40%, transparent);
        }

        /* Everything inside takes the contrast colour too. The value carries
           text-surface-900 dark:text-surface-0, which is tuned for a pale
           surface and unreadable on a saturated one. Component styles are
           unlayered and beat Tailwind's @layer utilities, so this needs no
           !important.

           Wholesale is safe *for this card*: สายเข้าทั้งหมด is neutral-polarity,
           so diffClass gives it weight only and there is no green or red here
           to override. Make a solid card down-good and this would swallow its
           polarity colour - it would need a .diff-better/.diff-worse exemption
           at that point. */
        .summary-card * {
            color: var(--primary-contrast-color);
        }

        /* Polarity colour on the comparison number: green when the change is
           an improvement, red when it is not, and nothing at all when a rise is
           neither good nor bad - the four neutral metrics keep the plain
           weighted number rather than a grey one.

           These are deep 900s in light mode and pale 100s in dark, not the 500s
           this started with. Colour only ever lands on the down-good cards -
           the two red counters and the two amber durations - so the text is
           always fighting a mid-tone tint of a similar hue. At 500 that measured
           1.07:1 for green and 1.77:1 for red, which is invisible; these sit
           between 4.28:1 and 4.81:1.

           That is a shade under the 4.5:1 minimum in two of the four
           combinations (green-900 on the amber card, 4.28; red-100 on it in
           dark, 4.32). Going further - 950 or 50 - does clear it, but at those
           extremes the colour stops reading as green or red at all, which
           defeats the point. An opaque chip is the only way to have both. */
        .diff-better {
            color: var(--p-green-900);
        }

        .diff-worse {
            color: var(--p-red-900);
        }

        :host-context(.app-dark) .diff-better {
            color: var(--p-green-100);
        }

        :host-context(.app-dark) .diff-worse {
            color: var(--p-red-100);
        }

        /* The card labels, sized off a variable rather than a Tailwind step.
           1rem is text-base, the size these were tuned to for a desk monitor at
           150% zoom; the scale only ever grows it.

           line-height is set explicitly because font-size alone would leave the
           label rows cramped as the text grows - Tailwind's text-base carries a
           fixed 1.5rem line-height that does not follow a calc(). */
        .stat-label {
            font-size: calc(1rem * var(--label-scale, 1));
            line-height: 1.4;
        }

        /* A step down below Tailwind's sm. On a phone the counter cards are
           half-width and the duration cards the same, so the longest of these -
           "คิวเต็ม" - has a couple of inches to sit in and wraps at
           1rem.

           A flat value rather than a scaled one, and nothing is lost by that:
           appliedScale already clamps to 1 below lg, so --label-scale is 1
           everywhere this rule applies.

           639.98px rather than 640px so this and the sm utilities, which take
           effect at 640px exactly, cannot both match on a 640px viewport. */
        @media (max-width: 639.98px) {
            .stat-label {
                font-size: 0.9375rem;
            }

            /* The duration cards go a step smaller again. Their labels are the
               longest on the board - "เวลาที่ตอบรับนานที่สุด" and
               "ค่าเฉลี่ยเวลาคุยสาย" - and on a phone they share the same
               half-width card as the counters, so what fits the six does not
               fit these four. */
            .stat-label-time {
                font-size: 0.8125rem;
            }

            /* And their comparison line smaller still. It is the longest string
               on any card - "+00:00:04 เทียบกับเมื่อวาน", a duration rather than
               the counters' two or three digits - so it is the first thing to
               wrap on a phone.

               This overrides the text-xs already on the element. Component
               styles are unlayered while Tailwind utilities sit in
               @layer utilities, and unlayered author styles win over layered
               ones regardless of order - the same rule that makes .card's
               margin reset work. */
            .diff-line-time {
                font-size: 0.625rem;
            }
        }
    `,
    template: `
        <div class="col-span-12">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div class="font-semibold text-xl">สถิติการให้บริการต่อวัน (EMS Agent)</div>
                <div class="flex items-center gap-3 text-sm text-surface-500 dark:text-surface-400">
                    @if (loading()) {
                        <p-progress-spinner [style]="{ width: '1rem', height: '1rem' }" strokeWidth="8" ariaLabel="กำลังโหลด" />
                    }
                    @if (status()) {
                        <span>{{ status() }}</span>
                    }
                    <!-- Sized for a wall monitor read from across the room, where
                         only the 7xl numbers are legible and the labels are not.
                         The setting is remembered per browser, so the screen on
                         the wall is set once rather than on every page load.

                         Hidden below lg, not disabled. Disabled says "not right
                         now"; here nothing the viewer could do would ever enable
                         it on that device, so it is an irrelevant control rather
                         than a blocked one - and it would be clutter in the
                         header exactly where the header has least room.

                         appliedScale still clamps to 1 below lg, so a size set
                         on a wide screen cannot follow the board into a narrow
                         one and wrap the labels there. -->
                    @if (largeScreen()) {
                        <span class="flex items-center gap-1">
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
                    <!-- Opens the official NIEMS page in a new tab. An anchor
                         rather than a button because pButton is an attribute
                         directive, so this is a real link: middle-click works,
                         and the board itself is never navigated away from. -->
                    <a
                        pButton
                        href="https://rnis-qm.niems.go.th/stats-by-center"
                        target="_blank"
                        rel="noopener noreferrer"
                        label="ดูรายละเอียด"
                        icon="pi pi-external-link"
                        iconPos="right"
                        severity="secondary"
                        size="small"
                        [text]="true"
                        class="shrink-0"
                    ></a>
                </div>
            </div>
        </div>
        @for (card of cards(); track card.label) {
            <div class="col-span-6 lg:col-span-4 xl:col-span-2">
                <!-- h-full so every card in the row is the height of the
                     tallest. These are grid items and stretch already; without
                     it the card inside only grows to its own content, so one
                     label wrapping to a second line left the row ragged. -->
                <div
                    class="card mb-0 h-full"
                    [class.summary-card]="card.solid"
                    [class.tinted-card]="!card.solid"
                    [style.--card-hue]="'var(--p-' + card.color + '-500)'"
                >
                    <div class="flex justify-between mb-4">
                        <div>
                            <!-- stat-label, base 1rem: at 150% zoom with the
                                 sidebar open these are one-sixth-width, and
                                 "คิวเต็ม" - the longest of the six,
                                 with a space to break on - wrapped at text-xl.
                                 That size suits a desk; the +/- control scales
                                 it up for a wall monitor without changing it
                                 for everyone. -->
                            <span class="block font-medium mb-4 stat-label">{{ card.label }}</span>
                            @if (loading()) {
                                <p-skeleton width="min(7rem, 100%)" height="4.5rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-7xl">{{ card.value }}</div>
                            }
                        </div>
                    </div>
                    <!-- Omitted entirely when there is nothing to compare
                         against, rather than shown as +0 - which would claim
                         the previous day matched exactly. -->
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else if (card.diff !== null) {
                        <!-- text-sm: "-105 เทียบกับเมื่อวาน" is the widest this
                             line gets, and at base size it wrapped too. -->
                        <div class="text-sm">
                            <span [class]="diffClass(card.diff, card.polarity)">{{ diffText(card.diff) }}</span>
                            <span> เทียบกับเมื่อวาน</span>
                        </div>
                    }
                </div>
            </div>
        }
        @for (card of timeCards(); track card.label) {
            <div class="col-span-6 xl:col-span-3">
                <div class="card tinted-card mb-0 h-full" [style.--card-hue]="'var(--p-' + card.color + '-500)'">
                    <div class="flex justify-between mb-4">
                        <div>
                            <!-- Same scaled label as the counter row above:
                                 these four are the longest on the board and sit
                                 in quarter-width cards, so text-xl wrapped at
                                 150% browser zoom. -->
                            <span class="block font-medium mb-4 stat-label stat-label-time">{{ card.label }}</span>
                            <!-- Smaller below sm: these cards are half-width on a
                                 phone and HH:MM:SS is eight characters, so 5xl
                                 overflows where the counters' 2-3 digits do not. -->
                            @if (loading()) {
                                <p-skeleton width="min(9rem, 100%)" height="3rem" />
                            } @else {
                                <div class="text-surface-900 dark:text-surface-0 font-medium text-3xl sm:text-5xl">{{ card.value }}</div>
                            }
                        </div>
                    </div>
                    @if (loading()) {
                        <p-skeleton width="min(11rem, 100%)" height="1.25rem" />
                    } @else if (card.diff !== null) {
                        <!-- Same xs/sm split as the counter row. This line is
                             longer still ("+00:00:04 เทียบกับเมื่อวาน"), so it
                             is the one that wrapped first on mobile. -->
                        <div class="text-xs sm:text-sm diff-line-time">
                            <span [class]="diffClass(card.diff, card.polarity)">{{ durationDiffText(card.diff) }}</span>
                            <span> เทียบกับเมื่อวาน</span>
                        </div>
                    }
                </div>
            </div>
        }
    `
})
export class CallStatsWidget {
    private readonly data = inject(CallStatsDataService);

    // 1 is text-base, the size the labels were tuned to for a desk monitor at
    // 150% zoom, so the default is exactly today's board. The ceiling is 2x:
    // past that a label out-sizes the number it belongs to, and the six-column
    // row starts wrapping "คิวเต็ม" onto three lines.
    protected readonly MIN_SCALE = 1;
    protected readonly MAX_SCALE = 2;
    private static readonly STEP = 0.25;

    // The stored preference, which is not necessarily what is rendered.
    protected readonly labelScale = signal(readStoredScale());

    protected readonly largeScreen = signal(matchesLargeScreen());

    /** What actually reaches the CSS.
     *
     *  Disabling the buttons below `lg` stops the scale being *raised* there,
     *  but on its own it would not stop the problem: the preference is
     *  remembered per browser, so a window resized narrow - or a desktop
     *  profile opened on a smaller screen - would keep applying whatever was
     *  set while it was wide, which is the wrapping this is meant to avoid.
     *  Clamping what is applied, while leaving the stored value alone, means
     *  the wall setting comes back intact the moment the window is wide again.
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
        this.setScale(this.labelScale() + CallStatsWidget.STEP);
    }

    protected scaleDown(): void {
        this.setScale(this.labelScale() - CallStatsWidget.STEP);
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

    // Skeletons only while the first payload is in flight. Once it has
    // arrived, a missing number is a dash - "we asked and there is nothing
    // for this day" - and a skeleton would promise something still coming.
    protected readonly loading = this.data.loading;

    // Label, colour, and which counter each card reads - the one place the
    // upstream field names are bound to what is on screen. Keyed on
    // CallStatsDiff rather than CallStatsSummary so a card can only ever name
    // one of the six counters, never `day` or `stale`.
    private static readonly CARDS: { label: string; color: string; field: keyof CallStatsDiff; polarity: Polarity; solid?: boolean }[] = [
        // incoming and outgoing are neutral on purpose: call volume is demand,
        // not performance. Painting a busy day red would pass judgement on
        // something the centre does not control.
        { label: 'สายเข้าทั้งหมด', color: 'blue', field: 'incoming', polarity: 'neutral', solid: true },
        { label: 'รับสาย', color: 'emerald', field: 'answer', polarity: 'neutral' },
        { label: 'รับสาย SLA', color: 'emerald', field: 'sla', polarity: 'neutral' },
        { label: 'ไม่ได้รับสาย', color: 'red', field: 'abandon', polarity: 'down-good' },
        { label: 'คิวเต็ม', color: 'red', field: 'queue_full_abandon', polarity: 'down-good' },
        { label: 'โทรออก', color: 'violet', field: 'outgoing', polarity: 'neutral' }
    ];

    readonly cards = computed<StatCard[]>(() => {
        const summary = this.data.summary();
        // A dash, never 0, whenever the number would be made up: still
        // connecting, the source is unreachable, the day is outside what it
        // retains - or the backend has caught the source contradicting itself,
        // which is the one case where a number *did* arrive and still must not
        // be shown. A real 0 (a quiet morning right after midnight) arrives as
        // available:true, trusted, and is shown as 0.
        const hasNumbers = this.data.hasNumbers() && this.data.trusted();

        // The comparison is only meaningful next to a real number, so it is
        // dropped whenever the counters themselves are a dash.
        const diff = hasNumbers ? summary!.diff : null;

        return CallStatsWidget.CARDS.map(({ label, color, field, polarity, solid }) => ({
            label,
            color,
            polarity,
            solid,
            value: hasNumbers ? (summary![field] as number).toLocaleString('en-US') : '—',
            diff: diff ? diff[field] : null
        }));
    });

    // Second row: durations rather than counts, so these format as H:MM:SS
    // instead of a thousands-separated integer.
    // Ordered and coloured in pairs: talk time (emerald) then answer time
    // (amber), so the colour groups the two metrics that measure the same
    // thing rather than distinguishing all four from each other.
    private static readonly TIME_CARDS: { label: string; color: string; field: keyof CallTimes; polarity: Polarity }[] = [
        // Talk time is neutral: a shorter call can mean an efficient handover
        // or a caller being rushed through an emergency, and nothing here can
        // tell those apart. Time-to-answer has no such ambiguity.
        { label: 'ค่าเฉลี่ยเวลาคุยสาย', color: 'emerald', field: 'avg_service', polarity: 'neutral' },
        { label: 'ระยะเวลารวมคุยสาย', color: 'emerald', field: 'total_service', polarity: 'neutral' },
        { label: 'ค่าเฉลี่ยเวลาตอบรับ', color: 'amber', field: 'avg_accept', polarity: 'down-good' },
        { label: 'เวลาที่ตอบรับนานที่สุด', color: 'amber', field: 'longest_accept', polarity: 'down-good' }
    ];

    readonly timeCards = computed<StatCard[]>(() => {
        // `times` is independent of the counters: this row can blank while the
        // six above still show numbers, so it gets its own guard rather than
        // reusing hasNumbers().
        // Blanked by a discredited feed too: the durations come from a
        // different endpoint but the same host, so whatever made the counters
        // untrustworthy applies to them as well.
        const times = this.data.loading() || !this.data.trusted() ? null : (this.data.summary()?.times ?? null);
        // Only offered alongside a real duration, and independently of the
        // counter row's diff - the two feeds can be missing different days.
        const diff = times ? (this.data.summary()?.times_diff ?? null) : null;

        return CallStatsWidget.TIME_CARDS.map(({ label, color, field, polarity }) => ({
            label,
            color,
            polarity,
            value: times ? formatDuration(times[field]) : '—',
            diff: diff ? diff[field] : null
        }));
    });

    // Empty while everything is healthy, matching the agent board above it.
    //
    // It used to end with "ข้อมูลวันที่ ... ณ เวลา ...", which restated the day
    // the board is obviously showing and a fetch time nobody reads from four
    // metres away. Kept for the three states the cards genuinely cannot
    // express: nothing has arrived, the source is unreachable, and the day
    // being shown has no data.
    //
    // The stale line keeps its clock and drops the date - when the numbers
    // have stopped refreshing, how old they are is the whole message.
    readonly status = computed(() => {
        if (this.data.loading()) return 'กำลังเชื่อมต่อ...';

        const summary = this.data.summary();
        if (!summary) return 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้';

        // Ranked above both of the following, because they describe the
        // request and this describes the answer: a feed can reply promptly, on
        // time, with numbers that cannot be true. That is the state the retired
        // NIEMS hosts sat in for as long as they were left running.
        const health = this.data.healthMessage();
        if (health) return health;

        if (!summary.available) return `ไม่พบข้อมูลของวันที่ ${THAI_DATE.format(parseIsoDate(summary.day))}`;
        if (this.data.isStale()) return `ล่าสุด ${this.fetchedTime(summary)} กำลังลองใหม่`;
        return '';
    });

    // `fetched_at` is a naive Bangkok wall-clock string from the backend, so
    // the HH:MM is sliced straight out of it. Parsing it into a Date would
    // re-interpret it in the viewer's timezone and shift the time shown.
    private fetchedTime(summary: CallStatsSummary): string {
        return summary.fetched_at?.slice(11, 16) ?? '';
    }

    // Polarity, carried by colour: green when a change is an improvement, red
    // when it is not. A metric where a rise is neither - call volume is demand,
    // not performance - gets no colour, just weight, rather than a grey that
    // would read as a third verdict.
    //
    // The shades live in .diff-better / .diff-worse rather than as Tailwind
    // classes here, because they have to flip between light and dark mode; see
    // the styles block for the contrast measurements behind the choice.
    diffClass(diff: number, polarity: Polarity): string {
        if (diff === 0 || polarity === 'neutral') return 'font-medium';
        const better = polarity === 'up-good' ? diff > 0 : diff < 0;
        return better ? 'diff-better font-black' : 'diff-worse font-black';
    }

    diffText(diff: number): string {
        return diff > 0 ? `+${diff}` : `${diff}`;
    }

    // Signed, and formatted as a duration so it reads against the HH:MM:SS
    // above it - a bare "+6" next to "00:00:12" gives no unit.
    durationDiffText(diff: number): string {
        return `${diff < 0 ? '-' : '+'}${formatDuration(Math.abs(diff))}`;
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
