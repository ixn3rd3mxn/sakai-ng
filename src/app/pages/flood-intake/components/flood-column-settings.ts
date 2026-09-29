import { DragDropModule } from '@angular/cdk/drag-drop';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { PopoverModule } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';
import { OpenBelowDirective } from '../../../shared/open-below.directive';
import { FloodColumnsService } from '../services/flood-columns.service';

// Which optional columns the case table shows, and in what order, per
// browser. A popover like the date filter's, and live the same way: each tick
// or drag applies at once and there is no Save step, so the table beside it
// is the preview. The drag list is the Angular CDK's, as in PrimeNG's own
// column toggle demo; the CDK is already here as a PrimeNG peer dependency.
// Unlike the demo, a dragged row stays inside the list and moves only up and
// down: the list is the only place it can be dropped.
@Component({
    selector: 'flood-column-settings',
    standalone: true,
    imports: [DragDropModule, FormsModule, ButtonModule, CheckboxModule, PopoverModule, TooltipModule, OpenBelowDirective],
    template: `
        <button
            pButton
            type="button"
            icon="pi pi-cog"
            class="p-button-outlined"
            aria-label="ตั้งค่าคอลัมน์"
            pTooltip="ตั้งค่าคอลัมน์"
            tooltipPosition="bottom"
            (click)="panel.toggle($event)"
        ></button>

        <!-- openBelow: under the button, never flipped above it - see
             shared/open-below.directive. -->
        <p-popover #panel openBelow>
            <!-- A floor, not a fixed width: the widest label alone left
                 ทั้งหมด and ค่าเริ่มต้น crowded together. It still grows for a
                 longer label and still fits a phone. -->
            <div class="flex flex-col gap-3" style="min-width: min(16rem, calc(100vw - 2rem)); max-width: calc(100vw - 2rem)">
                <div class="flex items-center justify-between gap-4">
                    <span class="font-semibold">คอลัมน์ที่แสดง</span>
                    <button
                        pButton
                        type="button"
                        icon="pi pi-times"
                        class="p-button-text p-button-rounded"
                        size="small"
                        aria-label="ปิด"
                        (click)="panel.hide()"
                    ></button>
                </div>

                <div
                    class="column-list flex flex-col -mx-2"
                    cdkDropList
                    cdkDropListLockAxis="y"
                    (cdkDropListDropped)="settings.move($event.previousIndex, $event.currentIndex)"
                >
                    @for (column of settings.columns(); track column.key) {
                        <div
                            class="flex items-center gap-2 px-2 py-1 rounded-md cursor-move select-none hover:bg-surface-100 dark:hover:bg-surface-800"
                            cdkDrag
                            cdkDragBoundary=".column-list"
                            cdkDragPreviewClass="column-drag-preview"
                        >
                            <i class="pi pi-bars text-surface-400 dark:text-surface-500"></i>
                            <p-checkbox
                                [inputId]="'flood-col-' + column.key"
                                [binary]="true"
                                [ngModel]="settings.isVisible(column.key)"
                                (ngModelChange)="settings.setVisible(column.key, $event)"
                            />
                            <label [for]="'flood-col-' + column.key" class="cursor-pointer">{{ column.label }}</label>
                        </div>
                    }
                </div>

                <!-- Apart on purpose: ทั้งหมด only ticks, under the
                     checkboxes it ticks; ค่าเริ่มต้น also throws away the
                     order, so it is not one slip away from the other. -->
                <div class="flex justify-between">
                    <button
                        pButton
                        type="button"
                        label="ทั้งหมด"
                        class="p-button-text"
                        size="small"
                        (click)="settings.showAll()"
                    ></button>
                    <button
                        pButton
                        type="button"
                        label="ค่าเริ่มต้น"
                        class="p-button-text"
                        size="small"
                        (click)="settings.reset()"
                    ></button>
                </div>
            </div>
        </p-popover>
    `,
    styles: `
        .column-drag-preview {
            background: var(--p-content-background);
            border-radius: var(--p-content-border-radius);
            box-shadow: var(--p-overlay-popover-shadow);
        }
        .column-list .cdk-drag-placeholder {
            opacity: 0.4;
        }
        /* Rows make way smoothly while dragging, and everything lands at once
           on drop. Keyed to the placeholder, not .cdk-drop-list-dragging: the
           CDK removes the placeholder before it clears the rows' offsets,
           whereas the list class lingers until the next change detection and
           would slide them back into place. No .cdk-drag-animating rule, so
           the dropped row does not glide either. */
        .column-list:has(.cdk-drag-placeholder) .cdk-drag:not(.cdk-drag-placeholder) {
            transition: transform 200ms ease;
        }
    `
})
export class FloodColumnSettings {
    readonly settings = inject(FloodColumnsService);
}
