import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { parseIsoDate, toBuddhistYear } from '../dashboardclone/services/date-utils';
import { FloodCaseFormDrawer } from './components/flood-case-form-drawer';
import { FloodCase, FloodTab } from './flood-intake.types';
import { FloodApiService } from './services/flood-api.service';
import { FloodDataService } from './services/flood-data.service';
import { FloodDraftService } from './services/flood-draft.service';

interface TabDefinition {
    key: FloodTab;
    label: string;
}

// Slow on purpose: a queued case is not lost, and hammering a connection that
// is already struggling helps nobody. The `online` event covers the case where
// the link comes back before the next tick.
const OUTBOX_RETRY_MS = 20_000;

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
        DatePickerModule,
        ToastModule,
        TooltipModule,
        FloodCaseFormDrawer
    ],
    providers: [FloodDataService, FloodDraftService, MessageService, ConfirmationService],
    styles: [
        `
            /* Scoped to this component, never global: the operators scan this
               table for a duplicate while still on the phone, so it has to show
               8-10 rows on one screen. PrimeNG's default cell padding shows
               four. */
            :host ::ng-deep .flood-table .p-datatable-tbody > tr > td {
                padding: 0.5rem 0.75rem;
            }
            :host ::ng-deep .flood-table .p-datatable-thead > tr > th {
                padding: 0.6rem 0.75rem;
                white-space: nowrap;
            }

            /* The longest field on the row. Two lines, then an ellipsis - the
               full text is one click away in the drawer, and letting it wrap
               freely is what costs the other six rows. */
            .clamp-2 {
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
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

        <div class="card">
            <div class="flex flex-wrap justify-between items-start gap-3 mb-4">
                <div>
                    <div class="font-semibold text-xl">รับแจ้งขอความช่วยเหลืออุทกภัย</div>
                    <div class="text-sm text-surface-500 dark:text-surface-400 mt-1">
                        @if (dataService.context(); as ctx) {
                            วันปฏิบัติการ {{ formatDay(ctx.operational_day) }} · เวร{{ ctx.shift_label }}
                        }
                    </div>
                </div>

                <!-- Weighted left to right: the action taken on nearly every
                     call is the darkest and sits furthest right, where the
                     hand already is. -->
                <div class="flex items-center gap-2">
                    <button
                        pButton
                        type="button"
                        label="Export"
                        icon="pi pi-download"
                        class="p-button-outlined"
                        [disabled]="dataService.total() === 0"
                        (click)="exportCases()"
                    ></button>
                    <button pButton type="button" label="รับแจ้งใหม่" icon="pi pi-plus" (click)="openNewCase()"></button>
                </div>
            </div>

            <div class="flex flex-wrap items-center gap-1 mb-4">
                @for (tab of tabs; track tab.key) {
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

            <div class="flex flex-wrap gap-2 mb-3">
                <p-iconfield class="grow min-w-[16rem]">
                    <p-inputicon class="pi pi-search" />
                    <input
                        #searchInput
                        pInputText
                        type="text"
                        class="w-full"
                        placeholder="ค้นหา เบอร์โทร ตำบล ผู้แจ้ง อาการ หน่วยปฏิบัติ"
                        [ngModel]="dataService.filters().search"
                        (ngModelChange)="dataService.setSearch($event)"
                    />
                </p-iconfield>

                <p-datepicker
                    [ngModel]="dateRange()"
                    (ngModelChange)="onDateRange($event)"
                    selectionMode="range"
                    dateFormat="dd/mm/yy"
                    placeholder="ช่วงวันที่"
                    [readonlyInput]="true"
                    [showClear]="true"
                    styleClass="w-44"
                />

                <p-select
                    [ngModel]="dataService.filters().districtCode"
                    (ngModelChange)="dataService.setDistrict($event)"
                    [options]="dataService.districtOptions()"
                    optionLabel="label"
                    optionValue="value"
                    placeholder="อำเภอ"
                    [showClear]="true"
                    [filter]="true"
                    filterBy="label"
                    styleClass="w-40"
                />

                <p-select
                    [ngModel]="dataService.filters().shift"
                    (ngModelChange)="dataService.setShift($event)"
                    [options]="dataService.shifts()"
                    optionLabel="label"
                    optionValue="code"
                    placeholder="เวร"
                    [showClear]="true"
                    styleClass="w-32"
                />

                <p-select
                    [ngModel]="dataService.filters().agentName"
                    (ngModelChange)="dataService.setAgent($event)"
                    [options]="dataService.agents()"
                    optionLabel="agent_name"
                    optionValue="agent_name"
                    placeholder="เจ้าหน้าที่รับแจ้ง"
                    [showClear]="true"
                    [filter]="true"
                    filterBy="agent_name"
                    styleClass="w-52"
                />

                @if (dataService.hasActiveFilters()) {
                    <button
                        pButton
                        type="button"
                        label="ล้างตัวกรอง"
                        icon="pi pi-filter-slash"
                        class="p-button-text"
                        (click)="clearFilters()"
                    ></button>
                }
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
                [value]="dataService.loading() ? skeletonRows : dataService.cases()"
                [selection]="selected()"
                (selectionChange)="selected.set($event)"
                dataKey="case_id"
                stripedRows
                [rows]="10"
                [rowHover]="true"
                [paginator]="!dataService.loading()"
                [showCurrentPageReport]="true"
                currentPageReportTemplate="แสดง {first} - {last} จาก {totalRecords} เคส"
                responsiveLayout="scroll"
            >
                <ng-template #header>
                    <tr>
                        <th style="width: 3rem">
                            <p-tableHeaderCheckbox />
                        </th>
                        <th style="width: 4rem">ลำดับ</th>
                        <th style="min-width: 8rem">วันที่ / เวลา</th>
                        <th style="min-width: 10rem">อำเภอ / ตำบล</th>
                        <th style="min-width: 10rem">ผู้แจ้ง</th>
                        <th style="min-width: 18rem">อาการสำคัญ</th>
                        <th style="min-width: 8rem">สถานะ</th>
                        <th style="width: 6rem">จัดการ</th>
                    </tr>
                </ng-template>

                <ng-template #body let-item let-rowIndex="rowIndex">
                    @if (dataService.loading()) {
                        <tr>
                            <td><p-skeleton width="1.2rem" /></td>
                            <td><p-skeleton width="1.5rem" /></td>
                            <td><p-skeleton width="min(5rem, 80%)" /></td>
                            <td><p-skeleton width="min(7rem, 80%)" /></td>
                            <td><p-skeleton width="min(7rem, 80%)" /></td>
                            <td><p-skeleton width="min(16rem, 90%)" /></td>
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

                            <td>
                                <div class="tabular">{{ item.time }}</div>
                                <div class="cell-sub tabular">{{ formatDay(item.date) }}</div>
                            </td>

                            <td>
                                <div>{{ item.district_name }}</div>
                                <div class="cell-sub">ต.{{ item.subdistrict_name }}</div>
                            </td>

                            <td>
                                <div>{{ item.reporter || '-' }}</div>
                                <div class="cell-sub tabular">{{ item.phone_display || '-' }}</div>
                            </td>

                            <td>
                                <div class="clamp-2">{{ item.chief_complaint }}</div>
                                @if (item.operating_unit) {
                                    <div class="cell-sub">หน่วย: {{ item.operating_unit }}</div>
                                }
                            </td>

                            <td>
                                <p-tag
                                    [value]="item.status_label"
                                    [severity]="item.status === 'success' ? 'success' : 'warn'"
                                    [icon]="item.status === 'success' ? 'pi pi-check-circle' : 'pi pi-clock'"
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
                    <tr>
                        <td colspan="8" class="text-center py-6 text-surface-500">
                            @if (dataService.hasActiveFilters()) {
                                ไม่พบเคสที่ตรงกับตัวกรอง
                            } @else {
                                ยังไม่มีการรับแจ้ง
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

    private readonly searchInput = viewChild<any>('searchInput');

    readonly tabs: TabDefinition[] = [
        { key: 'all', label: 'ทั้งหมด' },
        { key: 'today', label: 'วันนี้' },
        { key: 'current_shift', label: 'เวรนี้' },
        { key: 'pending', label: 'ยังไม่สำเร็จ' },
        { key: 'success', label: 'สำเร็จ' }
    ];

    readonly selected = signal<FloodCase[]>([]);
    readonly skeletonRows = Array.from({ length: 8 }, () => ({}) as FloodCase);

    private retryTimer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;
    private readonly onlineHandler = () => this.flushOutbox();

    // Mirrors the two ISO strings the service holds back into the Date pair
    // p-datepicker wants, so a refresh restores what the operator selected.
    readonly dateRange = computed<Date[] | null>(() => {
        const { dateFrom, dateTo } = this.dataService.filters();
        if (!dateFrom || !dateTo) return null;
        return [parseIsoDate(dateFrom), parseIsoDate(dateTo)];
    });

    constructor() {
        // A row that disappears from the stream (somebody else deleted or
        // filtered it away) must not stay selected, or a bulk update would
        // act on a case no longer on screen.
        effect(() => {
            const visible = new Set(this.dataService.cases().map((c) => c.case_id));
            const kept = this.selected().filter((c) => visible.has(c.case_id));
            if (kept.length !== this.selected().length) this.selected.set(kept);
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

    onDateRange(range: Date[] | null): void {
        this.dataService.setDateRange(range);
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
