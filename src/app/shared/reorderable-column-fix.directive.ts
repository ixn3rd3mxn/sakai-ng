import { DestroyRef, Directive, ElementRef, NgZone, Renderer2, inject } from '@angular/core';
import { Table } from 'primeng/table';

// Rides along with PrimeNG's pReorderableColumn (import it next to
// TableModule) and fills two gaps in its header drag as of PrimeNG 21:
//
// - PrimeNG decides which side of a header the drop goes - before or after
//   it, by which half the pointer is in - only on dragenter, once, as the
//   pointer comes in. Come in from the right, move to the left half, and it
//   still drops after. Between neighbours that is where the column already
//   is, so the drop does nothing: c1 onto c2 works, c2 back onto c1 does not.
//   Here the side is worked out again on every dragover.
// - It hides its arrows and forgets the dragged column only in its drop
//   handler. A drag let go anywhere else - the body, a fixed column, outside
//   the table - left the arrows up. Here dragend clears them either way.
//
// Over the dragged column itself the arrows are hidden: letting go there
// changes nothing, and arrows still pointing at a neighbour said it would.
//
// Outside Angular, as PrimeNG binds its own drag listeners: dragover fires
// many times a second and only moves the arrows, which needs no change
// detection.
@Directive({
    selector: '[pReorderableColumn]',
    standalone: true
})
export class ReorderableColumnFixDirective {
    private readonly table = inject(Table);
    private readonly el: HTMLElement = inject(ElementRef).nativeElement;

    constructor() {
        const renderer = inject(Renderer2);
        inject(NgZone).runOutsideAngular(() => {
            const unlisten = [renderer.listen(this.el, 'dragover', (event: DragEvent) => this.onDragOver(event)), renderer.listen(this.el, 'dragend', () => this.onDragEnd())];
            inject(DestroyRef).onDestroy(() => unlisten.forEach((off) => off()));
        });
    }

    private onDragOver(event: DragEvent): void {
        if (!this.table.draggedColumn) return;
        if (this.table.draggedColumn === this.el) this.hideIndicators();
        else this.table.onColumnDragEnter(event, this.el);
    }

    // Fires on the column that was dragged, after any drop. When PrimeNG took
    // the drop it has already done this, and doing it again is harmless.
    private onDragEnd(): void {
        this.hideIndicators();
        if (this.table.draggedColumn) {
            this.table.draggedColumn.draggable = false;
            this.table.draggedColumn = null;
        }
        this.table.dropPosition = null;
    }

    private hideIndicators(): void {
        for (const indicator of [this.table.reorderIndicatorUpViewChild, this.table.reorderIndicatorDownViewChild]) {
            if (indicator) indicator.nativeElement.style.display = 'none';
        }
    }
}
