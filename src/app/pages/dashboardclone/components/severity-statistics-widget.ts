import { Component, computed, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { SeverityItem } from '../dispatch.types';

const FALLBACK_LABELS = ['แดง', 'เหลือง', 'เขียว', 'ขาว', 'ดำ'];

/** One row of the list: the level, its count, and how long its bar is. */
interface SeverityRow {
    name: string;
    count: number;
    /** Share of the largest count in the set, 0-100. */
    pct: number;
    /** The CSS class that paints the bar - see the styles block. */
    tone: string;
}

// How far the longest bar reaches. Short of the full width on purpose: a bar
// flush to the end of its rail reads as "maxed out" against some limit, when
// what it actually means is "the largest of these five". Leaving a little rail
// showing keeps it a comparison rather than a gauge.
//
// Every bar is scaled by this, so the ratios between them are untouched - at a
// max of 14, that level fills 92% and a level of 2 fills 13%.
const MAX_FILL_PERCENT = 92;

// The bars are painted the colours they are named after. These are not
// arbitrary categories: แดง/เหลือง/เขียว/ขาว/ดำ is the national EMS triage
// code, and it is the vocabulary dispatchers were trained in, so the colour
// says what the label says without anyone having to read it.
//
// Keyed on the name rather than on position, so a reordered or missing level
// cannot silently shift every colour by one.
const SEVERITY_TONE: Record<string, string> = {
    แดง: 'sev-red',
    เหลือง: 'sev-yellow',
    เขียว: 'sev-green',
    ขาว: 'sev-white',
    ดำ: 'sev-black'
};

@Component({
    standalone: true,
    selector: 'app-severity-statistics',
    imports: [SkeletonModule],
    styles: `
        /* The list is inset from the card's own padding, the title is not.

           The bars run the full width of whatever contains them, so at .card's
           global 1rem they very nearly touch its border - the other panels
           avoid that only because their content is inset text. Padding the card
           itself would fix the bars but move the heading with them, and the
           heading is meant to line up with the ones on the panels around it. So
           the inset goes on the rows and the column headers instead, and the
           title keeps the card's own 1rem. */
        .card {
            padding-bottom: 1.5rem;
        }
        .sev-head,
        .sev-row {
            padding-inline: 1.125rem;
        }

        .sev-row + .sev-row {
            margin-top: 1rem;
        }

        /* The faint rail, always drawn - a level at zero still shows its empty
           bar, so the row reads as "none of these" rather than as a row that
           failed to render.

           One rule serves every level: the track is the row's own colour at low
           strength, so it reads as the unfilled part of *that* bar rather than
           as a neutral grey that happens to sit behind it.

           color-mix with transparent rather than with the card, so it works
           over whatever the card is filled with.

           The inset shadow is the same hue again, so the rail looks recessed
           into the row rather than sitting on it - a coloured inner shadow
           rather than a grey one, or the tint and the shading would disagree
           about what colour the empty bar is. Kept shallow: at a 3px offset and
           6px blur it read as a trench cut through the row rather than a groove
           the bar sits in.

           --sev-track-tint exists for the one level whose own colour makes an
           invisible rail; everything else falls through to --sev-color. It is
           applied to the shadow as well as the tint, because a white inner
           shadow on a white rail would be no shadow at all. */
        .sev-track {
            position: relative;
            height: 1rem;
            width: 100%;
            margin-top: 0.5rem;
            border-radius: 9999px;
            overflow: hidden;
            background-color: color-mix(in srgb, var(--sev-track-tint, var(--sev-color)) 24%, transparent);
            box-shadow: inset 0px 2px 4px 0px color-mix(in srgb, var(--sev-track-tint, var(--sev-color)) 45%, transparent 55%);
        }

        .sev-fill {
            height: 100%;
            border-radius: 9999px;
            background: var(--sev-color);

            /* The bar reads as sitting proud of the row while the track behind
               it reads as cut into it. The two shadows point in opposite
               directions on purpose - that opposition is the whole effect, and
               either one alone would just look like shading.

               Inset only. An outer drop shadow would be the obvious way to lift
               the bar, but the track sets overflow: hidden to keep the fill
               inside its rounded ends, and that clips anything drawn outside
               the fill's own box. */
            box-shadow:
                /* Raised, not recessed - the light comes from above, so the top
                   inside edge is lit and the bottom is where the surface turns
                   away from it. The previous stack had these the other way
                   round, which is what made the bar sit *in* the row rather
                   than *on* it.

                   Both mixed from --sev-color, so each bar is lit and shaded in
                   its own hue rather than washed white and dirtied with black. */
                inset 0px 2px 3px 0px color-mix(in srgb, #fff 30%, var(--sev-color)),
                inset 0px -2px 4px 0px color-mix(in srgb, #000 18%, var(--sev-color));

            /* The bar grows into its new length when a shift's numbers change,
               rather than snapping - on a board that updates over SSE while
               someone is looking at it, the movement is what says a number
               changed. */
            transition: width 300ms ease;
        }

        /* One colour per level; the track derives from it. */
        .sev-red {
            --sev-color: var(--p-red-500);
        }

        .sev-yellow {
            --sev-color: var(--p-amber-400);
        }

        .sev-green {
            --sev-color: var(--p-green-500);
        }

        /* White still needs its rail tinted from a grey - its own colour would
           make an invisible track on a light card. The fill itself needs no
           help: it always sits inside that rail, so a white bar reads against
           the grey behind it without any border. */
        .sev-white {
            --sev-color: var(--p-surface-0);
            --sev-track-tint: var(--p-surface-500);
        }

        .sev-black {
            --sev-color: var(--p-surface-900);
        }

        /* A level the lookup table gains later that is not one of the five:
           there is no colour to be literal about, so it takes the theme's. */
        .sev-unknown {
            --sev-color: var(--p-primary-400);
        }

        /* Dark mode. The three hues step one shade lighter to hold their own
           against a dark card; white needs no edge there; and ดำ has to lift to
           a mid grey or it disappears into the surface entirely - the one place
           the literal-colour idea has to bend. */
        :host-context(.app-dark) .sev-red {
            --sev-color: var(--p-red-400);
        }

        :host-context(.app-dark) .sev-yellow {
            --sev-color: var(--p-amber-300);
        }

        :host-context(.app-dark) .sev-green {
            --sev-color: var(--p-green-400);
        }

        :host-context(.app-dark) .sev-black {
            --sev-color: var(--p-surface-500);
        }
    `,
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">สถิติระดับความรุนแรงที่เกิดขึ้น</div>
        <!-- Column headers, named once at the top so no row has to repeat them.
             Muted and small: they say what the two columns are, and then get
             out of the way of the numbers. Rendered in every state so the list
             does not shift when data arrives. -->
        <div class="sev-head flex items-baseline justify-between gap-2 mb-3 text-sm text-muted-color">
            <span>ระดับความรุนแรง</span>
            <span>จำนวน</span>
        </div>
        @if (loading()) {
            <!-- Same five rows in the same boxes as the real list, so the card
                 does not change height when the numbers land. -->
            @for (row of rows(); track row.name) {
                <div class="sev-row">
                    <div class="flex items-baseline justify-between gap-2">
                        <p-skeleton width="min(4rem, 100%)" height="1.25rem" />
                        <p-skeleton width="2rem" height="2.25rem" />
                    </div>
                    <!-- Carries the tone so the rail paints here too. Without it
                         --sev-color is unset, the track's color-mix is invalid
                         at computed-value time, and the rail silently vanishes
                         for the second the skeleton is up. -->
                    <div [class]="'sev-track ' + row.tone"></div>
                </div>
            }
        } @else if (isEmpty()) {
            <div class="flex flex-col items-center justify-center gap-3 py-12 text-muted-color">
                <i class="pi pi-chart-bar text-5xl opacity-30"></i>
                <span>ยังไม่มีการบันทึกข้อมูล</span>
            </div>
        } @else {
            @for (row of rows(); track row.name) {
                <div class="sev-row">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="font-medium">{{ row.name }}</span>
                        <!-- tabular-nums so the counts line up down the right
                             edge instead of shifting with digit widths. -->
                        <span class="text-surface-900 dark:text-surface-0 font-medium text-3xl tabular-nums">{{ row.count }}</span>
                    </div>
                    <!-- The rail is always drawn; only the fill is gated, so a
                         zero level shows an empty bar rather than a gap. -->
                    <div [class]="'sev-track ' + row.tone">
                        @if (row.count > 0) {
                            <div class="sev-fill" [style.width.%]="row.pct"></div>
                        }
                    </div>
                </div>
            }
        }
    </div>`
})
export class SeverityStatisticsWidget {
    items = input<SeverityItem[]>([]);

    // Set by the dashboard while the stream has not yet delivered a snapshot
    // for the current selection.
    loading = input<boolean>(false);

    /** The five levels in triage order, each with its share of the largest.
     *
     *  Deliberately not sorted by count. "Ranked" here is what the bars show,
     *  not what the order says: แดง to ดำ is the sequence the triage code is
     *  taught in, and resorting it every time a number changes would move rows
     *  under the reader on a board that updates while they watch.
     */
    protected readonly rows = computed<SeverityRow[]>(() => {
        const items = this.items();
        const source = items.length ? items : FALLBACK_LABELS.map((name) => ({ severity_name: name, count: 0 }) as SeverityItem);

        // Relative to the largest count, not to the total - the question this
        // answers is "which level is the tallest", and a share of the total
        // would leave every bar short whenever the incidents spread evenly.
        const max = Math.max(...source.map((item) => item.count), 0);

        return source.map((item) => ({
            name: item.severity_name,
            count: item.count,
            pct: max > 0 ? (item.count / max) * MAX_FILL_PERCENT : 0,
            tone: SEVERITY_TONE[item.severity_name?.trim()] ?? 'sev-unknown'
        }));
    });

    // Every level at zero is a real answer - the shift recorded nothing - and
    // five empty rows would look like a component that failed to load rather
    // than one saying so.
    protected readonly isEmpty = computed(() => this.rows().every((row) => row.count === 0));
}
