import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { FloatLabelModule } from 'primeng/floatlabel';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { groupByRecent, prependRecent } from '../../shared/recent-picks';
import { parseIsoDate, toBuddhistYear } from '../dashboardclone/services/date-utils';
import { FloodCaseFormDrawer } from './components/flood-case-form-drawer';
import { FloodColumnSettings } from './components/flood-column-settings';
import { FloodDateFilter } from './components/flood-date-filter';
import { FloodAgent, FloodCase, FloodSortOrder, FloodTab } from './flood-intake.types';
import { FloodApiService } from './services/flood-api.service';
import { FloodColumnsService } from './services/flood-columns.service';
import { FloodDataService } from './services/flood-data.service';
import { FloodDraftService } from './services/flood-draft.service';
import { TruncateTooltipDirective } from '../../shared/truncate-tooltip.directive';
import { OpenBelowDirective } from '../../shared/open-below.directive';
import { TableEmptyState } from '../../shared/table-empty-state';
// Header drag-to-reorder is off for now - see the <p-table> in the template.
// import { ReorderableColumnFixDirective } from '../../shared/reorderable-column-fix.directive';

interface TabDefinition {
    key: FloodTab;
    label: string;
}

// Slow on purpose: a queued case is not lost, and hammering a connection that
// is already struggling helps nobody. The `online` event covers the case where
// the link comes back before the next tick.
const OUTBOX_RETRY_MS = 20_000;

const NARROW_PHONE = '(max-width: 360px)';

@Component({
    selector: 'app-flood-intake',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        TagModule,
        SkeletonModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        SelectModule,
        FloatLabelModule,
        ToastModule,
        TooltipModule,
        TruncateTooltipDirective,
        OpenBelowDirective,
        // ReorderableColumnFixDirective,
        FloodCaseFormDrawer,
        FloodColumnSettings,
        FloodDateFilter,
        TableEmptyState
    ],
    providers: [FloodDataService, FloodDraftService, FloodColumnsService, MessageService, ConfirmationService],
    styles: [
        `
            /* The header's ↻ for the date filter: a small round icon button is
               taller than the text line it sits in, and would push everything
               below down whenever a date is applied. */
            :host ::ng-deep .date-reset {
                margin-block: -0.5rem;
            }

            /* Scoped to this component, never global: the operators scan this
               table for a duplicate while still on the phone, so it has to show
               8-10 rows on one screen. PrimeNG's default cell padding shows
               four. */
            :host ::ng-deep .flood-table .p-datatable-tbody > tr > td {
                padding: 0.5rem 0.75rem;
            }

            /* Every body row is the same height, data and skeleton alike, so
               the table does not jump when loading ends and a row's height
               never depends on whether it has a second line. 57px is what a
               two-line row measures with the padding above; cells are
               clamped so nothing can push past it. */
            :host ::ng-deep .flood-table .p-datatable-tbody > tr {
                height: 57px;
            }

            /* The empty row stands in for the eight skeleton rows
               (skeletonRows), so the table does not shrink when loading
               ends with nothing to list. */
            :host ::ng-deep .flood-table .p-datatable-tbody > tr.flood-empty-row {
                height: calc(8 * 57px);
            }
            :host ::ng-deep .flood-table .p-datatable-thead > tr > th {
                padding: 0.6rem 0.75rem;
                white-space: nowrap;
            }

            /* The arrows above and below the gap a dragged header will drop
               into. PrimeNG's 1rem icon crowded the short header row. It
               measures the arrows on every dragstart to place them, so they
               stay centred on the gap at this size. */
            // :host ::ng-deep .flood-table .p-datatable-row-reorder-indicator-up .p-icon,
            // :host ::ng-deep .flood-table .p-datatable-row-reorder-indicator-down .p-icon {
            //     width: 0.35rem;
            //     height: 0.35rem;
            // }

            // /* The top arrow, raised a little off the header's top edge, which
            //    PrimeNG sits 1px into. PrimeNG sets its top inline on every
            //    drag, so the margin adds to that instead of fighting it. The
            //    z-index keeps it drawn over the header cells; 1 is enough there
            //    and stays under the topbar when the page is scrolled. */
            // :host ::ng-deep .flood-table .p-datatable-row-reorder-indicator-up {
            //     margin-top: -0.25rem;
            //     z-index: 1;
            // }

            /* The longest field on the row. One line, then an ellipsis - the
               full text is in a tooltip and the drawer, and letting it wrap
               freely is what costs the other six rows. The unit line below it
               gets the same treatment so the cell never exceeds two rows.

               padding-block / margin-block: room for Thai marks inside the
               clip without changing the row - see "Thai marks and clipped
               text" in layout/_utils.scss. */
            .clamp-1 {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                padding-block: 0.4em;
                margin-block: -0.4em;
            }

            /* Auto table layout sizes a column to its widest nowrap content,
               which would defeat the ellipsis. Zeroing the cell's max-width
               keeps its text out of that measurement, so the column stays at
               the header's min-width plus its share of the free space. */
            .clamp-cell {
                max-width: 0;
            }

            /* The เจ้าหน้าที่รับแจ้ง filter's list, exactly as wide as the
               field (w-52, 13rem) rather than growing to its longest name;
               a name that does not fit ends in an ellipsis. Pure CSS so
               PrimeNG's own positioning is untouched. The list renders
               inside the select (no appendTo), so :host reaches it.

               > span: PrimeNG renders the option text in a bare flex-item
               span, which will not shrink below its text without
               min-width: 0. padding-block / margin-block as on .clamp-1. */
            /* Where a filter's list starts out, in the moment between
               PrimeNG inserting it and positioning it. It renders inside the
               select, and until PrimeNG writes its left it sits at its static
               position - the select's right end - so a list wider than the
               room past that end sticks out of the screen for that moment
               (เจ้าหน้าที่รับแจ้ง, เรียงลำดับข้อมูล on a phone). A phone
               browser answers an overflowing page by zooming it out, which
               shortens how far the page can scroll: scrolled down, the page
               was pulled up by up to ~120px each time the list opened.
               Starting it at the select's left edge keeps it on screen;
               PrimeNG's own inline left replaces this once it places the
               list. */
            :host ::ng-deep .p-select > p-overlay > .p-overlay {
                inset-inline-start: 0;
            }

            :host ::ng-deep .p-select-overlay.agent-filter-panel {
                width: 13rem;
            }
            :host ::ng-deep .agent-filter-panel .p-select-option > span {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding-block: 0.4em;
                margin-block: -0.4em;
            }

            /* Short values that must never wrap: the column widens to fit
               instead. A full age ("123 ปี 11 เดือน 30 วัน") is wider than
               its column's min-width and would otherwise break onto a third
               line, which the fixed row height cannot hold. Not an ellipsis
               like .clamp-1 - an age or a name cut short is a wrong one. */
            .cell-nowrap {
                white-space: nowrap;
            }

            /* On a phone the paginator does not fit on one line, and left to
               wrap it broke between the page buttons. The page report gets a
               line of its own instead, with the buttons whole beneath it. */
            @media (max-width: 639px) {
                :host ::ng-deep .flood-table .p-paginator-current {
                    flex-basis: 100%;
                    justify-content: center;
                }
            }

            /* The empty row's message, held in the part of the table that is
               on screen. The row spans every column, so centred on the row
               it sat off screen once the table was scrolled sideways (a tab
               switch keeps the scroll) and the row looked blank. Sticky at
               the cell's left padding, as wide as the scroll box less both
               paddings: centred in view at any scroll. cqi reads the scroll
               box's width, which the container-type makes available. */
            :host ::ng-deep .flood-table .p-datatable-table-container {
                container-type: inline-size;
            }
            .empty-message {
                position: sticky;
                left: 0.75rem;
                width: calc(100cqi - 1.5rem);
                text-align: center;
            }

            .cell-sub {
                font-size: 0.75rem;
                line-height: 1.1rem;
                color: var(--text-color-secondary);
            }

            /* Numbers and codes line up column-wise when they share a width,
               which is what makes a phone number scannable down the page. */
            .tabular {
                font-variant-numeric: tabular-nums;
                font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            }

            .tab-button {
                display: inline-flex;
                align-items: center;
                gap: 0.45rem;
                padding: 0.45rem 0.9rem;
                border-radius: 6px;
                border: 1px solid transparent;
                background: transparent;
                color: var(--text-color-secondary);
                font-size: 0.875rem;
                cursor: pointer;
                transition: background 0.15s, color 0.15s;
            }
            .tab-button:hover {
                background: var(--surface-hover);
            }
            .tab-button.active {
                background: var(--surface-card);
                border-color: var(--surface-border);
                color: var(--text-color);
                font-weight: 600;
            }
            /* Lighter than the label it follows, so the word reads first and
               the number second. */
            .tab-count {
                font-variant-numeric: tabular-nums;
                opacity: 0.6;
            }
        `
    ],
    template: `
        <p-toast />

        <div class="card table-card">
            <div class="flex flex-wrap justify-between items-start gap-3 mb-4">
                <div>
                    <div class="font-semibold text-xl">รับแจ้งขอความช่วยเหลืออุทกภัย</div>
                    <div class="text-sm text-surface-500 dark:text-surface-400 mt-1 flex flex-wrap items-center gap-x-1">
                        <span>วันปฏิบัติการ</span>
                        @if (dataService.context(); as ctx) {
                            <span>{{ formatDay(ctx.operational_day) }} · เวร{{ ctx.shift_label }}</span>
                        } @else {
                            <p-skeleton width="9.5rem" height="0.875rem" />
                        }
                        <!-- What the date filter is set to. The วันที่ button
                             keeps its label so the filter row never reflows;
                             the day and shift before this stay, since the
                             วันนี้ / เวรนี้ tabs count from them. The ↻ clears
                             the dates only - ล้างตัวกรอง clears everything. -->
                        @if (dateFilter.summary() ?? clearingDates(); as dates) {
                            <!-- Its own line on a phone, where it would wrap
                                 anyway - and there without the joining dot,
                                 which would otherwise start the line. -->
                            <span class="inline-flex items-center gap-1 basis-full sm:basis-auto">
                                <!-- "เฉพาะ" and the amber of /report/dashboard's
                                     back-dated line mark it as a filter on the
                                     table, not a second "today" beside the
                                     grey context before it. -->
                                <span
                                    ><span class="hidden sm:inline">· </span
                                    ><span class="text-amber-600 dark:text-amber-400 font-medium">แสดงเฉพาะวันที่ {{ dates }}</span></span
                                >
                                <p-button
                                    icon="pi pi-refresh"
                                    severity="warn"
                                    [text]="true"
                                    [rounded]="true"
                                    size="small"
                                    ariaLabel="ล้างวันที่"
                                    pTooltip="ล้างวันที่"
                                    tooltipPosition="bottom"
                                    styleClass="date-reset"
                                    [loading]="!!clearingDates()"
                                    (onClick)="clearDates()"
                                />
                            </span>
                        }
                    </div>
                </div>

                <!-- Weighted left to right: the action taken on nearly every
                     call is the darkest and sits furthest right, where the
                     hand already is. -->
                <div class="flex items-center gap-2">
                    <flood-column-settings />
                    <!-- Icon only on a narrow phone, like the ⚙ beside it:
                         with the label the three buttons are wider than the
                         card there, and รับแจ้งใหม่ broke onto two lines. -->
                    <button
                        pButton
                        type="button"
                        [label]="narrowPhone() ? '' : 'Export'"
                        [attr.aria-label]="narrowPhone() ? 'Export' : null"
                        [pTooltip]="narrowPhone() ? 'Export' : ''"
                        tooltipPosition="bottom"
                        icon="pi pi-download"
                        class="p-button-outlined"
                        [disabled]="dataService.total() === 0"
                        (click)="exportCases()"
                    ></button>
                    <button pButton type="button" label="รับแจ้งใหม่" icon="pi pi-plus" (click)="openNewCase()"></button>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-1 mb-4">
                @for (tab of visibleTabs(); track tab.key) {
                    <button
                        type="button"
                        class="tab-button"
                        [class.active]="dataService.filters().tab === tab.key"
                        (click)="dataService.setTab(tab.key)"
                    >
                        <span>{{ tab.label }}</span>
                        <span class="tab-count">{{ countFor(tab.key) }}</span>
                    </button>
                }
            </div>

            <!-- Two even columns on a phone, search across both: left to
                 wrap, the fixed-width selects each took a line of their own
                 and ended at a different place. เจ้าหน้าที่รับแจ้ง takes both
                 columns - its label and names do not fit in one - so เวร and
                 ล้างตัวกรอง move after it to share the last line (order-1).
                 At 360px and under they take a line each, where ล้างตัวกรอง
                 no longer fits in half. From sm up they wrap as one row at their own widths. -->
            <div class="grid grid-cols-2 gap-2 mb-3 sm:flex sm:flex-wrap">
                <p-iconfield class="col-span-2 grow sm:min-w-[16rem]">
                    <p-inputicon class="pi pi-search" />
                    <input
                        #searchInput
                        pInputText
                        type="text"
                        class="w-full thai-input"
                        placeholder="ค้นหา เบอร์โทร ตำบล ผู้แจ้ง อาการ หน่วยปฏิบัติ"
                        [ngModel]="dataService.filters().search"
                        (ngModelChange)="dataService.setSearch($event)"
                    />
                    <!-- Same × as the drawer's text fields: only while there
                         is something to clear, and focus stays in the box so
                         the next search can be typed straight away. -->
                    @if (dataService.filters().search) {
                        <p-inputicon class="pi pi-times cursor-pointer" (click)="dataService.setSearch(''); searchInput.focus()" />
                    }
                </p-iconfield>

                <flood-date-filter #dateFilter />

                <!-- Never empty: newest first is the default, and ล้างตัวกรอง
                     puts it back. -->
                <p-floatlabel variant="on">
                    <p-select
                        openBelow
                        inputId="flood_order"
                        [ngModel]="dataService.filters().order"
                        (ngModelChange)="dataService.setOrder($event)"
                        [options]="orderOptions"
                        optionLabel="label"
                        optionValue="value"
                        styleClass="w-44 max-sm:w-full"
                    >
                        <!-- Cut on a phone of 360px and under, where the field
                             is half the row; the tooltip has the whole of it
                             (.select-value, layout/_utils.scss). -->
                        <ng-template #selectedItem let-option>
                            <span class="select-value" [appTruncateTooltip]="option.label">{{ option.label }}</span>
                        </ng-template>
                    </p-select>
                    <label for="flood_order">เรียงลำดับข้อมูล</label>
                </p-floatlabel>

                <p-floatlabel variant="on">
                    <p-select
                        openBelow
                        inputId="flood_district"
                        [ngModel]="dataService.filters().districtCode"
                        (ngModelChange)="dataService.setDistrict($event)"
                        [options]="districtGroups()"
                        [group]="true"
                        optionGroupLabel="label"
                        optionGroupChildren="items"
                        optionLabel="label"
                        optionValue="value"
                        [showClear]="true"
                        [filter]="true"
                        [resetFilterOnHide]="true"
                        filterBy="label"
                        styleClass="w-40 max-sm:w-full"
                    />
                    <label for="flood_district">อำเภอ</label>
                </p-floatlabel>

                <!-- Narrowed to the chosen amphoe; with none it lists every
                     tambon under its amphoe's header and picking one fills
                     the amphoe in - the same pair behaviour as the drawer. -->
                <p-floatlabel variant="on">
                    <p-select
                        openBelow
                        inputId="flood_subdistrict"
                        [ngModel]="dataService.filters().subdistrictCode"
                        (ngModelChange)="dataService.setSubdistrict($event)"
                        [options]="subdistrictGroups()"
                        [group]="true"
                        optionGroupLabel="label"
                        optionGroupChildren="items"
                        optionLabel="label"
                        optionValue="value"
                        [showClear]="true"
                        [filter]="true"
                        [resetFilterOnHide]="true"
                        filterBy="label"
                        styleClass="w-40 max-sm:w-full"
                    />
                    <label for="flood_subdistrict">ตำบล</label>
                </p-floatlabel>

                <p-floatlabel variant="on" class="max-sm:order-1 max-[360px]:col-span-2">
                    <p-select
                        openBelow
                        inputId="flood_shift"
                        [ngModel]="dataService.filters().shift"
                        (ngModelChange)="dataService.setShift($event)"
                        [options]="dataService.shifts()"
                        optionLabel="label"
                        optionValue="code"
                        [showClear]="true"
                        styleClass="w-32 max-sm:w-full"
                    />
                    <label for="flood_shift">เวร</label>
                </p-floatlabel>

                <p-floatlabel variant="on" class="max-sm:col-span-2">
                    <p-select
                        openBelow
                        inputId="flood_agent"
                        [ngModel]="dataService.filters().agentId"
                        (ngModelChange)="dataService.setAgent($event)"
                        [options]="agentGroups()"
                        [group]="true"
                        optionGroupLabel="label"
                        optionGroupChildren="items"
                        optionLabel="agent_name"
                        optionValue="agent_id"
                        [showClear]="true"
                        [filter]="true"
                        [resetFilterOnHide]="true"
                        filterBy="agent_name"
                        styleClass="w-52 max-sm:w-full"
                        panelStyleClass="agent-filter-panel"
                    >
                        <!-- Same bare span PrimeNG renders (.agent-filter-panel cuts
                             it), plus the tooltip for a name that does not fit. -->
                        <ng-template #item let-option>
                            <span [appTruncateTooltip]="option.agent_name">{{ option.agent_name }}</span>
                        </ng-template>
                        <!-- The chosen name in the closed field: same ellipsis as
                             PrimeNG's own, plus the tooltip when it is cut
                             (.select-value, layout/_utils.scss). -->
                        <ng-template #selectedItem let-option>
                            <span class="select-value" [appTruncateTooltip]="option.agent_name">{{ option.agent_name }}</span>
                        </ng-template>
                    </p-select>
                    <label for="flood_agent">เจ้าหน้าที่รับแจ้ง</label>
                </p-floatlabel>

                <!-- Always in the row and always live, so the controls do not
                     shift when the first filter is set and a click never has
                     to be second-guessed. Clearing nothing is a no-op. -->
                <button
                    pButton
                    type="button"
                    label="ล้างตัวกรอง"
                    icon="pi pi-filter-slash"
                    class="p-button-outlined max-sm:w-full max-sm:order-1 max-[360px]:col-span-2"
                    (click)="clearFilters()"
                ></button>
            </div>

            @if (selected().length > 0) {
                <div
                    class="flex flex-wrap items-center gap-3 mb-3 px-3 py-2 rounded border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800"
                >
                    <span class="text-sm">เลือกไว้ {{ selected().length }} เคส</span>
                    <button
                        pButton
                        type="button"
                        label="ทำเครื่องหมายสำเร็จ"
                        icon="pi pi-check"
                        class="p-button-sm"
                        (click)="bulkStatus('success')"
                    ></button>
                    <button
                        pButton
                        type="button"
                        label="ย้อนเป็นยังไม่สำเร็จ"
                        icon="pi pi-undo"
                        class="p-button-sm p-button-outlined"
                        (click)="bulkStatus('pending')"
                    ></button>
                    <button
                        pButton
                        type="button"
                        label="ยกเลิกการเลือก"
                        class="p-button-sm p-button-text"
                        (click)="selected.set([])"
                    ></button>
                </div>
            }

            @if (drafts.pending().length > 0) {
                <div class="mb-3 px-3 py-2 rounded border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/30 text-sm">
                    <div class="flex flex-wrap items-center gap-2">
                        <i class="pi pi-cloud-upload text-orange-600 dark:text-orange-400"></i>
                        <span class="font-medium">ยังไม่ได้บันทึกจริง {{ drafts.pending().length }} เคส</span>
                        <span class="text-surface-600 dark:text-surface-300">— เก็บไว้ในเครื่องและกำลังส่งซ้ำอัตโนมัติ</span>
                        <button pButton type="button" label="ลองส่งเดี๋ยวนี้" class="p-button-sm p-button-text" (click)="flushOutbox()"></button>
                    </div>
                    @for (entry of drafts.pending(); track entry.id) {
                        <div class="text-xs text-surface-500 mt-1">• {{ entry.label }} (พยายามแล้ว {{ entry.attempts }} ครั้ง)</div>
                    }
                </div>
            }

            @if (dataService.truncated()) {
                <div class="mb-3 px-3 py-2 rounded bg-yellow-100 dark:bg-yellow-900/40 text-sm">
                    <i class="pi pi-exclamation-triangle mr-2"></i>
                    แสดง {{ dataService.cases().length }} เคสแรกจากทั้งหมด {{ dataService.total() }} เคส —
                    กรุณาจำกัดช่วงวันที่หรืออำเภอเพื่อดูให้ครบ
                </div>
            }

            <p-table
                #caseTable
                styleClass="flood-table"
                [value]="showSkeleton() ? skeletonRows : dataService.failed() ? [] : dataService.cases()"
                [selection]="selected()"
                (selectionChange)="selected.set($event)"
                dataKey="case_id"
                stripedRows
                [rows]="10"
                [rowHover]="true"
                [paginator]="true"
                [class.table-loading]="showSkeleton()"
                [showCurrentPageReport]="true"
                currentPageReportTemplate="แสดง {first} - {last} จาก {totalRecords} เคส"
                responsiveLayout="scroll"
            >
                <!-- Header drag-to-reorder is off for now: the order is
                     changed in the ตั้งค่าคอลัมน์ popover only. To turn it
                     back on, put these two back on <p-table> above:
                         [reorderableColumns]="true"
                         (onColReorder)="columns.moveVisible($event.dragIndex!, $event.dropIndex!)"
                     and pReorderableColumn back on the <th> below, and
                     uncomment ReorderableColumnFixDirective in the imports. -->
                <ng-template #header>
                    <tr>
                        <th style="width: 3rem">
                            <p-tableHeaderCheckbox />
                        </th>
                        <th style="width: 4rem">ลำดับ</th>
                        <!-- Only these can be dragged or dropped on; the drop
                             lands in the same saved order as the settings list. -->
                        @for (column of columns.visible(); track column.key) {
                            <!-- <th pReorderableColumn [style.min-width]="column.minWidth">{{ column.label }}</th> -->
                            <th [style.min-width]="column.minWidth">{{ column.label }}</th>
                        }
                        <th style="min-width: 8rem">สถานะ</th>
                        <th style="width: 6rem">จัดการ</th>
                    </tr>
                </ng-template>

                <ng-template #body let-item let-rowIndex="rowIndex">
                    @if (showSkeleton()) {
                        <tr>
                            <td><p-skeleton width="1.2rem" /></td>
                            <td><p-skeleton width="1.5rem" /></td>
                            @for (column of columns.visible(); track column.key) {
                                <td><p-skeleton [width]="column.skeletonWidth" /></td>
                            }
                            <td><p-skeleton width="min(5rem, 80%)" /></td>
                            <td><p-skeleton width="2rem" /></td>
                        </tr>
                    } @else {
                        <tr class="cursor-pointer" (click)="openCase(item, $event)">
                            <td (click)="$event.stopPropagation()">
                                <p-tableCheckbox [value]="item" />
                            </td>

                            <!-- Counted here, never stored. It restarts at 1
                                 whenever the filter changes and runs on across
                                 pages, which a saved number could not do once
                                 two operators were saving at the same moment. -->
                            <td class="tabular text-surface-500">{{ dataService.offset() + rowIndex + 1 }}</td>

                            <!-- Chosen per browser in flood-column-settings.
                                 A pair is two lines at most, as the fixed row
                                 height needs; long text is one line and an
                                 ellipsis - the drawer has the rest. -->
                            @for (column of columns.visible(); track column.key) {
                                @switch (column.key) {
                                    @case ('time') {
                                        <td>
                                            <div class="tabular">{{ item.time }}</div>
                                            <div class="cell-sub tabular">{{ formatDay(item.date) }}</div>
                                        </td>
                                    }
                                    @case ('area') {
                                        <td>
                                            <div>{{ item.subdistrict_name }}</div>
                                            <div class="cell-sub">อ.{{ item.district_name }}</div>
                                        </td>
                                    }
                                    @case ('location') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.location_note">{{ item.location_note || '-' }}</div>
                                        </td>
                                    }
                                    @case ('reporter') {
                                        <!-- The reporter is free text and can run
                                             long; it gets the ellipsis, the phone
                                             never does - at most 11 characters,
                                             well inside the column's min-width. -->
                                        <td class="clamp-cell">
                                            <div class="tabular">{{ item.phone_display || '-' }}</div>
                                            <div class="cell-sub clamp-1" [appTruncateTooltip]="item.reporter">{{ item.reporter || '-' }}</div>
                                        </td>
                                    }
                                    @case ('complaint') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.chief_complaint">{{ item.chief_complaint || '-' }}</div>
                                        </td>
                                    }
                                    @case ('unit') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.operating_unit">{{ item.operating_unit || '-' }}</div>
                                        </td>
                                    }
                                    @case ('shift') {
                                        <td>{{ item.shift_label || '-' }}</td>
                                    }
                                    @case ('agent') {
                                        <td class="cell-nowrap">
                                            <div>{{ item.agent_name || '-' }}</div>
                                            <div class="cell-sub">{{ item.channel_label || '-' }}</div>
                                        </td>
                                    }
                                    @case ('patient') {
                                        <td class="cell-nowrap">
                                            <div>{{ ageText(item) }}</div>
                                            <div class="cell-sub">{{ item.gender_label || '-' }}</div>
                                        </td>
                                    }
                                    @case ('ddpm') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.ddpm_coordination">{{ item.ddpm_coordination || '-' }}</div>
                                        </td>
                                    }
                                    @case ('assistance') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.assistance">{{ item.assistance || '-' }}</div>
                                        </td>
                                    }
                                    @case ('remarks') {
                                        <td class="clamp-cell">
                                            <div class="clamp-1" [appTruncateTooltip]="item.remarks">{{ item.remarks || '-' }}</div>
                                        </td>
                                    }
                                }
                            }

                            <td>
                                <p-tag
                                    [value]="item.status_label"
                                    [severity]="item.status === 'success' ? 'success' : 'warn'"
                                    [icon]="item.status === 'success' ? '' : ''"
                                />
                            </td>

                            <td (click)="$event.stopPropagation()">
                                <!-- The most frequent action after taking a
                                     call, so it lives on the row rather than
                                     behind opening the form. -->
                                <button
                                    pButton
                                    type="button"
                                    [icon]="item.status === 'success' ? 'pi pi-undo' : 'pi pi-check'"
                                    class="p-button-text p-button-rounded"
                                    [pTooltip]="item.status === 'success' ? 'ย้อนเป็นยังไม่สำเร็จ' : 'ทำเครื่องหมายสำเร็จ'"
                                    tooltipPosition="left"
                                    (click)="toggleStatus(item)"
                                ></button>
                            </td>
                        </tr>
                    }
                </ng-template>

                <ng-template #emptymessage>
                    <!-- As tall as the loading table (.flood-empty-row above);
                         blank like the report tables' (.table-empty-row). -->
                    <tr class="table-empty-row flood-empty-row">
                        <!-- The four fixed columns plus whatever is shown. -->
                        <td [attr.colspan]="columns.visible().length + 4">
                            @if (dataService.failed()) {
                                <app-table-empty-state class="empty-message" icon="pi-exclamation-circle" title="ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้" subtitle="ระบบจะเชื่อมต่อใหม่อัตโนมัติ" />
                            } @else if (dataService.hasActiveFilters()) {
                                <app-table-empty-state class="empty-message" icon="pi-filter-slash" title="ไม่พบเคสที่ตรงกับตัวกรอง" subtitle="ลองปรับหรือล้างตัวกรอง">
                                    <p-button label="ล้างตัวกรอง" icon="pi pi-filter-slash" size="small" (onClick)="clearFilters()" />
                                </app-table-empty-state>
                            } @else {
                                <app-table-empty-state class="empty-message" icon="pi-inbox" title="ยังไม่มีการรับแจ้ง" subtitle="เคสที่รับแจ้งจะแสดงที่นี่" />
                            }
                        </td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

        <app-flood-case-form-drawer
            [caseId]="activeCaseId()"
            (closed)="closeDrawer()"
            (savedCase)="onSaved($event)"
            (requestOpenCase)="openCaseById($event)"
        />
    `
})
export class FloodIntakeComponent implements OnInit, OnDestroy {
    readonly dataService = inject(FloodDataService);
    readonly drafts = inject(FloodDraftService);
    readonly columns = inject(FloodColumnsService);
    private readonly api = inject(FloodApiService);
    private readonly messageService = inject(MessageService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);

    // The open case lives in the URL, not in a component field: a refresh
    // mid-call has to land back on the same case, and an operator has to be
    // able to paste a link to one into a chat.
    readonly activeCaseId = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('case'))), {
        initialValue: null
    });

    // Sectioned like the drawer's dropdowns, from the same per-browser
    // shortlists: the names and areas this console records calls under are
    // the ones it filters by.
    readonly agentGroups = computed(() =>
        groupByRecent<FloodAgent>(this.dataService.agents(), this.drafts.recentOf('agent'), (a) => a.agent_id)
    );

    readonly districtGroups = computed(() =>
        groupByRecent(this.dataService.districtOptions(), this.drafts.recentOf('district'), (o) => o.value)
    );

    // Grouped by amphoe as in the drawer: with no amphoe chosen the header is
    // what tells two tambon of the same name apart.
    readonly subdistrictGroups = computed(() =>
        prependRecent(
            this.dataService.subdistrictGroupsFor(this.dataService.filters().districtCode),
            this.drafts.recentOf('subdistrict'),
            (o) => o.value
        )
    );

    private readonly searchInput = viewChild<any>('searchInput');
    private readonly drawer = viewChild(FloodCaseFormDrawer);
    private readonly dateFilterRef = viewChild.required(FloodDateFilter);
    private readonly caseTable = viewChild.required<Table>('caseTable');

    // The header's date line while its ↻ is clearing it: kept on screen, with
    // the ↻ spinning, until the table has reloaded without the dates - the
    // same wait the report pages' ↻ shows - rather than vanishing on the
    // click while the table is still loading.
    readonly clearingDates = signal<string | null>(null);

    clearDates(): void {
        if (this.clearingDates()) return;
        this.clearingDates.set(this.dateFilterRef().summary());
        this.dateFilterRef().clear();
    }

    /** For the route guard: may the open drawer, if any, be discarded? */
    canLeave(): Promise<boolean> {
        return this.drawer()?.confirmDiscard() ?? Promise.resolve(true);
    }

    // วันนี้ and เวรนี้ last: they are the pair that drops out (visibleTabs),
    // so the tabs that always stay keep their places when they go.
    readonly tabs: TabDefinition[] = [
        { key: 'all', label: 'ทั้งหมด' },
        { key: 'pending', label: 'ยังไม่สำเร็จ' },
        { key: 'success', label: 'สำเร็จ' },
        { key: 'today', label: 'วันนี้' },
        { key: 'current_shift', label: 'เวรนี้' }
    ];

    readonly orderOptions: { label: string; value: FloodSortOrder }[] = [
        { label: 'ใหม่ > เก่า', value: 'desc' },
        { label: 'เก่า > ใหม่', value: 'asc' }
    ];

    // "วันนี้" and "เวรนี้" are live-event views. They go when the server says
    // no case has come in for a week (the page is an archive now, whatever the
    // month) and when a date range is set: an explicit range and "today"
    // contradict each other, and the backend would let "today" win silently.
    readonly visibleTabs = computed<TabDefinition[]>(() => {
        const { dateFrom, dateTo, dates } = this.dataService.filters();
        const live = this.dataService.context()?.active === true && !dateFrom && !dateTo && !dates.length;
        return live ? this.tabs : this.tabs.filter((t) => t.key !== 'today' && t.key !== 'current_shift');
    });

    // 360px and under (Galaxy S, a Fold's cover screen): too narrow for the
    // header's buttons with Export's label.
    readonly narrowPhone = signal(typeof window !== 'undefined' && !!window.matchMedia?.(NARROW_PHONE).matches);

    readonly selected = signal<FloodCase[]>([]);
    readonly skeletonRows = Array.from({ length: 8 }, () => ({}) as FloodCase);
    // The table's skeleton. A failed connection ends it even though
    // `loading` stays up - see FloodDataService.failed - and the table shows
    // its "cannot connect" state instead.
    readonly showSkeleton = computed(() => this.dataService.loading() && !this.dataService.failed());

    private retryTimer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;
    private readonly onlineHandler = () => this.flushOutbox();

    constructor() {
        if (typeof window !== 'undefined' && window.matchMedia) {
            const query = window.matchMedia(NARROW_PHONE);
            const onChange = (event: MediaQueryListEvent) => this.narrowPhone.set(event.matches);
            query.addEventListener('change', onChange);
            inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
        }

        // Back to page 1 whenever loading starts, i.e. on every filter change.
        // The paginator stays up while loading, and the table keeps its page
        // across value changes: an operator on page 3 would see the eight
        // skeleton rows land on page 1 and an empty page 3 under them. Keyed
        // on loading, not on the cases, because the list is a live stream -
        // a tick must not throw the operator back to page 1.
        effect(() => {
            if (this.dataService.loading()) this.caseTable().first = 0;
        });

        // The reload a ↻ started has landed (or there was nothing to reload):
        // the date line can go.
        effect(() => {
            if (this.clearingDates() && !this.dataService.loading()) this.clearingDates.set(null);
        });

        // A row that disappears from the stream (somebody else deleted or
        // filtered it away) must not stay selected, or a bulk update would
        // act on a case no longer on screen.
        effect(() => {
            const visible = new Set(this.dataService.cases().map((c) => c.case_id));
            const kept = this.selected().filter((c) => visible.has(c.case_id));
            if (kept.length !== this.selected().length) this.selected.set(kept);
        });

        // A tab that has just been hidden (a range was set, or the stream
        // reported the event over while it was selected) must not stay
        // applied, or the table would be filtered by a button nobody can see.
        effect(() => {
            const tab = this.dataService.filters().tab;
            if (!this.visibleTabs().some((t) => t.key === tab)) this.dataService.setTab('all');
        });
    }

    ngOnInit(): void {
        // The operator is already on a call when the page opens; the first
        // thing they do is search for a duplicate.
        setTimeout(() => this.searchInput()?.nativeElement?.focus(), 0);

        // Anything queued by an earlier session is retried as soon as the page
        // is up, then on a timer, then the moment the browser says the network
        // is back. A queued case is a call that has been taken and not yet
        // recorded anywhere but this browser, so it is retried until it lands.
        this.flushOutbox();
        this.retryTimer = setInterval(() => this.flushOutbox(), OUTBOX_RETRY_MS);
        window.addEventListener('online', this.onlineHandler);
    }

    ngOnDestroy(): void {
        if (this.retryTimer) clearInterval(this.retryTimer);
        window.removeEventListener('online', this.onlineHandler);
    }

    // --- drawer -------------------------------------------------------------

    closeDrawer(): void {
        this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    }

    openCaseById(caseId: string): void {
        this.router.navigate([], { relativeTo: this.route, queryParams: { case: caseId } });
    }

    onSaved(_saved: FloodCase): void {
        // Nothing to merge by hand: the backend notifies every open stream on
        // write, so the authoritative row arrives here within a second.
    }

    // --- offline outbox -----------------------------------------------------

    flushOutbox(): void {
        if (this.flushing) return;
        const queued = this.drafts.snapshot();
        if (!queued.length) return;

        this.flushing = true;
        let remaining = queued.length;
        const done = () => {
            remaining -= 1;
            if (remaining <= 0) this.flushing = false;
        };

        for (const entry of queued) {
            this.api.createCase(entry.body).subscribe({
                next: (result) => {
                    this.drafts.dequeue(entry.id);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'ส่งเคสที่ค้างอยู่สำเร็จ',
                        detail: `${result.case.time} น. ต.${result.case.subdistrict_name}`,
                        life: 3000
                    });
                    done();
                },
                error: (err) => {
                    // A 400 will be refused identically forever, so it is
                    // dropped from the queue with a loud message rather than
                    // retried until the operator stops believing the banner.
                    if (err?.status >= 400 && err?.status < 500) {
                        this.drafts.dequeue(entry.id);
                        this.messageService.add({
                            severity: 'error',
                            summary: 'เคสที่ค้างอยู่ถูกปฏิเสธ',
                            detail: `${entry.label} — ${err?.error?.detail ?? 'ข้อมูลไม่ถูกต้อง'}`,
                            life: 10000
                        });
                    } else {
                        this.drafts.markAttempt(entry.id, err?.message ?? 'ส่งไม่สำเร็จ');
                    }
                    done();
                }
            });
        }
    }

    countFor(tab: FloodTab): number {
        const counts = this.dataService.counts();
        return counts ? counts[tab] : 0;
    }

    clearFilters(): void {
        this.dataService.clearFilters();
        this.selected.set([]);
    }

    formatDay(value: string): string {
        if (!value) return '';
        const date = parseIsoDate(value);
        const day = `${date.getDate()}`.padStart(2, '0');
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        return `${day}/${month}/${toBuddhistYear(date)}`;
    }

    // The server's age_label is a bare "45" when only years were recorded -
    // on purpose, so the export matches the old spreadsheet. A table column
    // headed "อายุ / เพศ" needs the unit, so it is added here only; labels
    // with months or days already carry their words.
    ageText(item: FloodCase): string {
        if (item.age === null) return '-';
        return item.age_months === null ? `${item.age} ปี` : item.age_label || '-';
    }

    // The drawer is addressed by query parameter so a refresh keeps the case
    // open and a link to one can be pasted into a chat.
    openNewCase(): void {
        this.router.navigate([], { relativeTo: this.route, queryParams: { case: 'new' } });
    }

    openCase(item: FloodCase, event: Event): void {
        event.stopPropagation();
        this.router.navigate([], { relativeTo: this.route, queryParams: { case: item.case_id } });
    }

    toggleStatus(item: FloodCase): void {
        const next = item.status === 'success' ? 'pending' : 'success';
        this.dataService.setStatus(item.case_id, next).subscribe({
            next: () =>
                this.messageService.add({
                    severity: 'success',
                    summary: next === 'success' ? 'ทำเครื่องหมายสำเร็จแล้ว' : 'ย้อนเป็นยังไม่สำเร็จแล้ว',
                    detail: `${item.time} น. ต.${item.subdistrict_name}`,
                    life: 2500
                }),
            error: () =>
                this.messageService.add({
                    severity: 'error',
                    summary: 'อัปเดตสถานะไม่สำเร็จ',
                    detail: 'กรุณาลองใหม่อีกครั้ง',
                    life: 4000
                })
        });
    }

    bulkStatus(status: 'success' | 'pending'): void {
        const ids = this.selected().map((c) => c.case_id);
        if (!ids.length) return;
        this.dataService.bulkSetStatus(ids, status).subscribe({
            next: (result) => {
                this.selected.set([]);
                this.messageService.add({
                    severity: 'success',
                    summary: `อัปเดต ${result.updated} เคสแล้ว`,
                    life: 2500
                });
            },
            error: () =>
                this.messageService.add({
                    severity: 'error',
                    summary: 'อัปเดตสถานะไม่สำเร็จ',
                    detail: 'กรุณาลองใหม่อีกครั้ง',
                    life: 4000
                })
        });
    }

    exportCases(): void {
        // A plain navigation, so the browser streams the file straight to
        // disk with the filename the backend sets.
        window.location.href = this.dataService.exportUrl();
    }
}
