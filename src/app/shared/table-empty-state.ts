import { Component, input } from '@angular/core';

// The one look for a table with nothing to list: an icon in a soft circle, a
// line saying what is missing, an optional line under it, and room for one
// action (projected - only where there is something that would help, like
// clearing a filter). PrimeNG v22's Table "Empty State" demo rebuilt for v21:
// the primeicons font in place of v22's @primeicons/angular SVG icons.
//
// Only the block. Where it sits, and keeping the table the height it had
// while loading, is the table's job: .table-empty-row in _utils.scss for the
// paginated tables, the empty row's own height on /flood/intake.
//
// Plain divs, not <p>: no margins for anything global to put back.
@Component({
    standalone: true,
    selector: 'app-table-empty-state',
    template: `
        <div class="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
            <!-- Inline: primeicons' own .pi font-size would win over a utility. -->
            <i class="pi {{ icon() }} text-surface-400 dark:text-surface-500" style="font-size: 1.75rem"></i>
        </div>
        <div>
            <div class="font-semibold text-surface-900 dark:text-surface-0">{{ title() }}</div>
            @if (subtitle()) {
                <div class="mt-1 text-sm text-surface-500 dark:text-surface-400">{{ subtitle() }}</div>
            }
        </div>
        <ng-content />
    `,
    host: { '[class.compact]': 'compact()' },
    styles: `
        :host {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            text-align: center;
            white-space: normal;
        }

        /* Side by side and smaller, for a table only two or three rows tall:
           stacked, the block is taller than the rows it has to sit inside. */
        :host(.compact) {
            flex-direction: row;
            text-align: start;
        }
        :host(.compact) .rounded-full {
            width: 2.5rem;
            height: 2.5rem;
            flex-shrink: 0;
        }
        /* !important over the icon's inline 1.75rem. */
        :host(.compact) i {
            font-size: 1.25rem !important;
        }
    `
})
export class TableEmptyState {
    /** A primeicons class, e.g. 'pi-inbox'. */
    icon = input.required<string>();
    title = input.required<string>();
    subtitle = input<string>('');
    /** Side-by-side layout for a table too short for the stacked one. */
    compact = input<boolean>(false);
}
