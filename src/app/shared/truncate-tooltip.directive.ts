import { Directive, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';

// Room kept between the tooltip and the side of the screen: the same 1rem a
// side that the width cap (min(25rem, 100vw - 2rem)) leaves.
const SCREEN_GUTTER = 16;
// Closest the arrow may sit to the tooltip's corner, so it never pokes out
// past the rounded edge.
const ARROW_INSET = 12;
// How long the pointer has to rest on cut-off text before its tooltip opens.
// With none, sweeping the mouse across a table of truncated cells flashed a
// tooltip on every cell it crossed; this opens one only where it stops.
// Hiding stays instant, so a tooltip never lingers over what comes next.
const SHOW_DELAY_MS = 400;

// The one way the app shows the rest of a line it has cut with an ellipsis:
// put appTruncateTooltip="<full text>" on the element that does the cutting
// (the one with overflow: hidden / text-overflow: ellipsis).
//
// It is PrimeNG's own tooltip with the same settings everywhere, so every
// truncated label behaves alike on every page:
// - showOnEllipsis: only while the text is actually cut. A label that fits
//   gets no tooltip repeating it. PrimeNG checks the host element's
//   scrollWidth against its width on each hover, so it follows the layout -
//   the same cell can be cut at 150% zoom and whole at 100%.
// - above the text, below it when there is no room above - never beside it
//   (see alignAboveOrBelow).
// - truncate-tooltip: the width rule in layout/_utils.scss.
// - a short delay before it opens (SHOW_DELAY_MS); none before it closes.
//
// Hover only. On a touch screen PrimeNG shows it while the finger is down
// (after the same delay); a tap's click closes it again.
@Directive({
    selector: '[appTruncateTooltip]',
    standalone: true,
    hostDirectives: [{ directive: Tooltip, inputs: ['pTooltip: appTruncateTooltip'] }]
})
export class TruncateTooltipDirective {
    private readonly tooltip = inject(Tooltip);

    constructor() {
        // Set straight into the options PrimeNG reads: its inputs only reach
        // them through ngOnChanges, which never runs for values bound here.
        this.tooltip.setOption({ showOnEllipsis: true, tooltipPosition: 'top', tooltipStyleClass: 'truncate-tooltip', showDelay: SHOW_DELAY_MS });
        this.tooltip.align = () => this.alignAboveOrBelow();
    }

    // Replaces PrimeNG's align(). Its top position centres the tooltip over
    // the text, and when that runs past either side of the screen - a cell
    // near the edge on a phone, or in a table scrolled sideways - it tries
    // bottom (which runs off the same way), then right, then left, and the
    // tooltip ended up beside the text. Here only the vertical space picks
    // above or below; running past a side slides the tooltip back onto the
    // screen instead, with the arrow moved so it still points at the text.
    private alignAboveOrBelow(): void {
        const tooltip = this.tooltip;
        tooltip.alignTop();
        if (tooltip.container.getBoundingClientRect().top < 0) {
            tooltip.alignBottom();
        }

        const box = tooltip.container.getBoundingClientRect();
        const maxLeft = Math.max(SCREEN_GUTTER, document.documentElement.clientWidth - box.width - SCREEN_GUTTER);
        const shift = Math.min(Math.max(box.left, SCREEN_GUTTER), maxLeft) - box.left;
        if (shift !== 0) {
            tooltip.container.style.left = `${parseFloat(tooltip.container.style.left) + shift}px`;
        }

        // PrimeNG puts the arrow at the tooltip's middle; aim it at the middle
        // of the text instead, which after a slide is somewhere else.
        const host = tooltip.el.nativeElement.getBoundingClientRect();
        const arrowX = host.left + host.width / 2 - (box.left + shift);
        tooltip.getArrowElement().style.left = `${Math.min(Math.max(arrowX, ARROW_INSET), box.width - ARROW_INSET)}px`;
    }
}
