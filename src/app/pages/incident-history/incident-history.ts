import { Component, OnInit, computed, effect, inject, viewChild } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { MultiSelectModule } from 'primeng/multiselect';
import { Table, TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { IncidentHistoryItem, IncidentRangeStatItem, IncidentStatItem, TopDayItem } from './incident-history.types';
import { IncidentHistoryDataService } from './services/incident-history-data.service';
import { IncidentHistoryDateDial } from './components/incident-history-date-dial';
import { IncidentRangeTrend } from './components/incident-range-trend';
import { IncidentHourlyChart } from './components/incident-hourly-chart';
import { TooltipModule } from 'primeng/tooltip';
import { TruncateTooltipDirective } from '../../shared/truncate-tooltip.directive';
import { formatBuddhistDay, formatThaiLongDate, formatThaiShortDate, parseIsoDate } from '../dashboardclone/services/date-utils';
import { PageFillerRow, isPageFiller, padToPage, pageFillers } from '../dashboardclone/services/page-filler';

// A breakdown-table row in either view: the name plus whichever numeric
// columns statColumns() lists.
type StatRow = (IncidentStatItem | IncidentRangeStatItem) & Record<string, string | number>;

// A row of the CBD ranking: the count and its share, e.g. "18.2%".
interface CbdRankRow {
    name: string;
    count: number;
    share: string;
}

@Component({
    selector: 'app-incident-history',
    standalone: true,
    imports: [
        TableModule,
        MultiSelectModule,
        TagModule,
        CommonModule,
        FormsModule,
        ButtonModule,
        IncidentHistoryDateDial,
        IncidentRangeTrend,
        IncidentHourlyChart,
        TooltipModule,
        TruncateTooltipDirective,
        ScrollTopModule,
        SkeletonModule,
        ToastModule
    ],
    // One toast for the page: the date dial, the header refresh button and
    // the top-days list all report through it.
    providers: [IncidentHistoryDataService, MessageService],
    template: `
        <!-- Same header row the dashboard puts above its grid (see
             incident-type-stats-widget.ts): the day being shown, and the
             back-dated warning when it is one, on a line of its own above the
             cards - not inside the first card. No shift here - this page is
             day-scoped (see incident-history-date-dial.ts). -->
        <div class="flex flex-wrap items-baseline gap-x-2 mb-4">
            <span class="font-semibold text-xl">สรุปผลทั้งหมด</span>
            @if (dataService.isRange()) {
                <!-- Several days or a range: the same warning colour and the
                     same way back as a back-dated day. -->
                <span class="text-amber-600 dark:text-amber-400 font-medium"> กำลังดูข้อมูล {{ rangeLabel() }}</span>
                <p-button
                    icon="pi pi-refresh"
                    severity="warn"
                    [text]="true"
                    [rounded]="true"
                    size="small"
                    pTooltip="กลับไปวันปัจจุบัน"
                    tooltipPosition="bottom"
                    ariaLabel="กลับไปวันปัจจุบัน"
                    [loading]="dataService.loading()"
                    (onClick)="resetToCurrent()"
                />
            } @else if (!dataService.isCurrent()) {
                <span class="text-amber-600 dark:text-amber-400 font-medium">
                    <span class="hidden lg:inline"> กำลังดูประวัติวันที่ {{ longDate() }} ลักษณะข้อมูลจะไม่เป็นปัจจุบัน</span>
                    <span class="lg:hidden"> กำลังดูข้อมูลย้อนหลัง: {{ shortDate() }}</span>
                </span>
                <p-button
                    icon="pi pi-refresh"
                    severity="warn"
                    [text]="true"
                    [rounded]="true"
                    size="small"
                    pTooltip="กลับไปวันปัจจุบัน"
                    tooltipPosition="bottom"
                    ariaLabel="กลับไปวันปัจจุบัน"
                    [loading]="dataService.loading()"
                    (onClick)="resetToCurrent()"
                />
            } @else {
                <span class="text-muted-color whitespace-nowrap">{{ longDate() }}</span>
            }
            <!-- Export is off for now, until someone asks for it. exportCsv()
                 below is kept whole; to turn it back on, uncomment this:
            <span class="ml-auto">
                <p-button label="Export" icon="pi pi-download" [outlined]="true" [disabled]="dataService.loading()" (onClick)="exportCsv()" />
            </span>
            -->
        </div>

        <!-- The headline chart: across the days for several, across the
             hours for one. -->
        @if (dataService.isRange()) {
            <app-incident-range-trend
                [days]="dataService.range()?.per_day ?? []"
                [continuous]="dataService.rangeSelection()?.kind === 'range'"
                [loading]="dataService.loading()"
            />
        } @else {
            <app-incident-hourly-chart [incidents]="dataService.history()?.incidents ?? []" [loading]="dataService.loading()" />
        }

        <div class="card" style="margin-bottom: 0.25rem">
            <div class="flex justify-between items-center mb-4">
                <div>
                    <div class="font-semibold text-xl">รายการเหตุการณ์</div>
                    <!-- A long range is cut server-side (RANGE_INCIDENT_LIMIT);
                         saying so keeps the list from passing for all of it.
                         Every count on the page still covers every incident. -->
                    @if (listCut(); as cut) {
                        <div class="text-sm text-muted-color mt-1">แสดง {{ cut.shown | number }} รายการแรกจาก {{ cut.total | number }} รายการ · ตัวเลขสถิตินับครบทุกรายการ</div>
                    }
                </div>
                <button pButton label="ล้างตัวกรอง" class="p-button-outlined" icon="pi pi-filter-slash" (click)="clear(incidentTable)"></button>
            </div>
            <p-table
                #incidentTable
                [value]="incidentRows()"
                stripedRows
                dataKey="incident_id"
                [rows]="PAGE_SIZE"
                [rowHover]="true"
                [paginator]="true"
                responsiveLayout="scroll"
                (onFilter)="padFilteredRows(incidentTable)"
            >
                <ng-template #header>
                    <tr>
                        <th style="min-width: 8rem">
                            <div class="flex justify-between items-center">
                                {{ dataService.isRange() ? 'วันที่ / เวลา' : 'เวลา' }}
                                <p-columnFilter field="hour" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="hourOptions"
                                            placeholder="เลือกชั่วโมง"
                                            (onChange)="filter($event.value)"
                                            optionLabel="label"
                                            optionValue="value"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option.label }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 10rem">
                            <div class="flex justify-between items-center">
                                ประเภท
                                <p-columnFilter field="call_type" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="dataService.callTypeOptions()"
                                            placeholder="ทั้งหมด"
                                            (onChange)="filter($event.value)"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 10rem">
                            <div class="flex justify-between items-center">
                                ช่องทางแจ้ง
                                <p-columnFilter field="reporting_channel" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="dataService.reportingChannelOptions()"
                                            placeholder="ทั้งหมด"
                                            (onChange)="filter($event.value)"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 13rem">
                            <div class="flex justify-between items-center">
                                ประเภทการเจ็บป่วย
                                <p-columnFilter field="case_type" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="dataService.caseTypeOptions()"
                                            placeholder="ทั้งหมด"
                                            (onChange)="filter($event.value)"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 14rem">
                            <div class="flex justify-between items-center">
                                CBD
                                <p-columnFilter field="cbd" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="dataService.cbdOptions()"
                                            placeholder="ทั้งหมด"
                                            (onChange)="filter($event.value)"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 12rem">
                            <div class="flex justify-between items-center">
                                ระดับความรุนแรง
                                <p-columnFilter field="severity" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [resetFilterOnHide]="true"
                                            [options]="dataService.severityOptions()"
                                            placeholder="ทั้งหมด"
                                            (onChange)="filter($event.value)"
                                            styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2">
                                                    <span>{{ option }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                    </tr>
                </ng-template>
                <ng-template #body let-incident>
                    @if (dataService.loading()) {
                        <tr>
                            <td><p-skeleton width="min(4rem, 80%)" /></td>
                            <td><p-skeleton width="min(6rem, 80%)" /></td>
                            <td><p-skeleton width="min(5rem, 80%)" /></td>
                            <td><p-skeleton width="min(6rem, 80%)" /></td>
                            <td><p-skeleton width="min(9rem, 90%)" /></td>
                            <!-- In a tag-sized box (.tag-box, _utils.scss) so a
                                 loading row is as tall as a loaded one. -->
                            <td><span class="tag-box"><p-skeleton width="min(4rem, 80%)" /></span></td>
                        </tr>
                    } @else if (isPageFiller(incident)) {
                        <!-- Pads a short page to PAGE_SIZE rows so the paginator
                             does not move; see page-filler.ts. Same tag-sized box
                             in the last cell as a real row without a badge. -->
                        <tr>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                            <td><span class="tag-box">-</span></td>
                        </tr>
                    } @else {
                    <tr>
                        <!-- Over several days the time alone no longer says which
                             day a row is from. One line, so a row is as tall
                             as it is in the one-day view. -->
                        <td class="whitespace-nowrap">
                            @if (dataService.isRange() && incident.date) {
                                <span class="text-muted-color">{{ shortIsoDate(incident.date) }}</span>
                            }
                            {{ incident.time }}
                        </td>
                        <td>{{ incident.call_type }}</td>
                        <td>{{ incident.reporting_channel }}</td>
                        <td>{{ incident.case_type }}</td>
                        <!-- Full "CBD7 <description>" label, cut with an ellipsis at
                             the column's width; the tooltip carries the whole thing.
                             A block span rather than styles on the td: an auto-layout
                             table does not honour max-width on a cell, but it does
                             size the cell to a block child that has one. -->
                        <td><span class="cbd-label" [appTruncateTooltip]="dataService.cbdLabel(incident.cbd)">{{ dataService.cbdLabel(incident.cbd) }}</span></td>
                        <td>
                            @if (incident.severity === '-') {
                                <!-- The dash sits in a tag-sized box (.tag-box,
                                     _utils.scss) so a row without a badge is exactly
                                     as tall as one with - otherwise the table jumps
                                     by a few px as rows page in and out. -->
                                <span class="tag-box">-</span>
                            } @else {
                                <p-tag [value]="incident.severity" [severity]="getSeverity(incident.severity)"></p-tag>
                            }
                        </td>
                    </tr>
                    }
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td colspan="6">ยังไม่มีการบันทึกข้อมูล</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">{{ dataService.isRange() ? 'วันที่บันทึกสูงสุดในช่วงที่เลือก' : 'วันที่บันทึกสูงสุดในเดือนนี้' }}</div>
        <p-table [value]="dataService.loading() ? skeletonDayRows : topDays()" stripedRows [rowHover]="true" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width: 7rem">อันดับ</th>
                    <th style="min-width: 13rem">วันที่</th>
                    <th style="min-width: 13rem">จำนวน</th>
                    <th style="min-width: 6rem">สลับเวลา</th>
                </tr>
            </ng-template>
            <ng-template #body let-item let-rowIndex="rowIndex">
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="1.5rem" /></td>
                        <td><p-skeleton width="min(12rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ rowIndex + 1 }}</td>
                        <td>{{ formatDay(item.operational_day) }}</td>
                        <td>{{ item.count }}</td>
                        <!-- Left-aligned under its heading, as on the flood intake
                             table's จัดการ column. -->
                        <td>
                            <!-- The day on screen gets a marker instead of a button:
                                 the list is for this same month, so the row for the
                                 day being viewed is nearly always in it. -->
                            @if (item.operational_day === viewedDay()) {
                                <p-tag value="กำลังดู" severity="secondary" />
                            } @else {
                                <p-button
                                    icon="pi pi-arrow-right"
                                    severity="secondary"
                                    [text]="true"
                                    [rounded]="true"
                                    size="small"
                                    pTooltip="สลับเวลา"
                                    tooltipPosition="left"
                                    ariaLabel="สลับเวลา"
                                    (onClick)="viewDay(item.operational_day)"
                                />
                            }
                        </td>
                    </tr>
                }
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="4">ยังไม่มีข้อมูล</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <!-- Which CBDs came up most - on the day shown, or over the days asked
         about: read off the CBD 25 table below, but ranked, and without the
         ones that never happened. -->
    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">CBD ที่มีเหตุเกิดมากที่สุด</div>
        <p-table [value]="dataService.loading() ? skeletonCbdRankRows : cbdRanking()" stripedRows [rowHover]="true" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width: 7rem">อันดับ</th>
                    <th style="min-width: 13rem">CBD</th>
                    <th style="min-width: 7rem">จำนวน</th>
                    <th style="min-width: 7rem">สัดส่วน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item let-rowIndex="rowIndex">
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="1.5rem" /></td>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(3rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ rowIndex + 1 }}</td>
                        <!-- As the CBD 25 table's names: the whole width the
                             column gets, cut with the tooltip only past it -
                             not the incident list's fixed 14rem. -->
                        <td><span class="cbd-name-label" [appTruncateTooltip]="item.name">{{ item.name }}</span></td>
                        <td>{{ item.count }}</td>
                        <td>{{ item.share }}</td>
                    </tr>
                }
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="4">ไม่มีเหตุการณ์ที่ระบุ CBD</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภท</div>
        <p-table [value]="dataService.loading() ? skeletonCallTypeRows : callTypeStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:206px">ชื่อ</th>
                    @for (column of statColumns(); track column.key) {
                        <th style="min-width:100px">{{ column.label }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        @for (column of statColumns(); track column.key) {
                            <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        }
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        @for (column of statColumns(); track column.key) {
                            <td>{{ item[column.key] }}</td>
                        }
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ช่องทางการแจ้งเหตุ</div>
        <p-table [value]="dataService.loading() ? skeletonChannelRows : reportingChannelStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:206px">ชื่อ</th>
                    @for (column of statColumns(); track column.key) {
                        <th style="min-width:100px">{{ column.label }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        @for (column of statColumns(); track column.key) {
                            <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        }
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        @for (column of statColumns(); track column.key) {
                            <td>{{ item[column.key] }}</td>
                        }
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภทของการเจ็บป่วย</div>
        <p-table [value]="dataService.loading() ? skeletonCaseTypeRows : caseTypeStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:206px">ชื่อ</th>
                    @for (column of statColumns(); track column.key) {
                        <th style="min-width:100px">{{ column.label }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        @for (column of statColumns(); track column.key) {
                            <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        }
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        @for (column of statColumns(); track column.key) {
                            <td>{{ item[column.key] }}</td>
                        }
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ระดับความรุนแรง</div>
        <p-table [value]="dataService.loading() ? skeletonSeverityRows : severityLevelStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:206px">ชื่อ</th>
                    @for (column of statColumns(); track column.key) {
                        <th style="min-width:100px">{{ column.label }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        @for (column of statColumns(); track column.key) {
                            <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        }
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        @for (column of statColumns(); track column.key) {
                            <td>{{ item[column.key] }}</td>
                        }
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">CBD 25</div>
        <p-table [value]="dataService.loading() ? skeletonCbdRows : cbdCategoryStatistics()" stripedRows [scrollable]="true" [rowHover]="true" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:206px">ชื่อ</th>
                    @for (column of statColumns(); track column.key) {
                        <th style="min-width:100px">{{ column.label }}</th>
                    }
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        @for (column of statColumns(); track column.key) {
                            <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        }
                    </tr>
                } @else {
                    <tr>
                        <!-- Cut with an ellipsis once it runs past the column; the
                             tooltip carries the whole name. -->
                        <td><span class="cbd-name-label" [appTruncateTooltip]="item.name">{{ item.name }}</span></td>
                        @for (column of statColumns(); track column.key) {
                            <td>{{ item[column.key] }}</td>
                        }
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>
    <p-toast />
    <p-scrolltop />
    <app-incident-history-date-dial />
    `,
    styles: `
        /* Sized and spaced like the dashboard's scroll-to-top: 50px with a
           20px icon, sitting the same gap to the left of the 50px date dial
           in the corner. !important because PrimeNG sets the position inline. */
        :host ::ng-deep .p-scrolltop {
            right: 5rem !important;
            bottom: 1rem !important;
            width: 50px !important;
            height: 50px !important;
        }

        :host ::ng-deep .p-scrolltop .p-scrolltop-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            line-height: 20px;
        }

        /* Caps the CBD column: labels longer than this truncate instead of
           widening it. The header's min-width is the same figure so short
           labels do not narrow it either. */
        .cbd-label,
        .cbd-name-label {
            display: block;
            max-width: 14rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            /* Thai below-vowels (สระอุ/อู) and tone marks reach past the
               line box, and overflow: hidden clips them. Pad the box so
               they fit, and pull the margin back in by the same amount
               so the row does not get any taller. */
            padding-block: 0.25em;
            margin-block: -0.25em;
        }

        /* CBD 25 card's ชื่อ column: fills whatever width the column ends
           up with and truncates past that. width: 0 keeps the name out of
           the table's column sizing, so the column is never narrower than
           the header's 356px min-width, and on a wide screen it takes its
           share of the spare width like today - min-width: 100% then
           stretches the text across all of it rather than leaving a gap
           before the numbers. */
        .cbd-name-label {
            max-width: none;
            width: 0;
            min-width: 100%;
        }
        .p-datatable-frozen-tbody {
            font-weight: bold;
        }

        .p-datatable-scrollable .p-frozen-column {
            font-weight: bold;
        }
    `
})
export class IncidentHistoryComponent implements OnInit {
    protected dataService = inject(IncidentHistoryDataService);
    private messageService = inject(MessageService);

    // The five breakdown tables share their columns. One day: that day's
    // shifts, then the day, its week and its month. Several days: each shift
    // summed over them and the total - a week or a
    // month column means nothing for "the 23rd to the 25th".
    protected readonly statColumns = computed<{ key: string; label: string }[]>(() =>
        this.dataService.isRange()
            ? [
                  { key: 'shift_morning', label: 'เวรเช้า' },
                  { key: 'shift_afternoon', label: 'เวรบ่าย' },
                  { key: 'shift_night', label: 'เวรดึก' },
                  { key: 'total', label: 'รวม' }
              ]
            : [
                  { key: 'shift_morning', label: 'ต่อเวรเช้า' },
                  { key: 'shift_afternoon', label: 'ต่อเวรบ่าย' },
                  { key: 'shift_night', label: 'ต่อเวรดึก' },
                  { key: 'daily', label: 'ต่อวัน' },
                  { key: 'weekly', label: 'ต่อสัปดาห์' },
                  { key: 'monthly', label: 'ต่อเดือน' }
              ]
    );

    private readonly statistics = computed(() => (this.dataService.isRange() ? this.dataService.range()?.statistics : this.dataService.history()?.statistics));
    protected callTypeStatistics = computed<StatRow[]>(() => (this.statistics()?.call_type ?? []) as StatRow[]);
    protected reportingChannelStatistics = computed<StatRow[]>(() => (this.statistics()?.reporting_channel ?? []) as StatRow[]);
    protected caseTypeStatistics = computed<StatRow[]>(() => (this.statistics()?.case_type ?? []) as StatRow[]);
    protected severityLevelStatistics = computed<StatRow[]>(() => (this.statistics()?.severity ?? []) as StatRow[]);
    protected cbdCategoryStatistics = computed<StatRow[]>(() => (this.statistics()?.cbd ?? []) as StatRow[]);
    protected topDays = computed(() => (this.dataService.isRange() ? this.dataService.range()?.top_days : this.dataService.history()?.top_days) ?? []);
    // The CBDs that happened, most first, top ten: over the days chosen, or
    // on the one day shown (the CBD 25 table's ต่อวัน). Ties keep that
    // table's order (CBD1 before CBD2), since sort is stable.
    // `share` is the part of every CBD-coded incident in the view - all of
    // them, not only the ten listed - so it means the same thing however
    // long the list is, and a month compares with a quarter.
    protected readonly cbdRanking = computed<CbdRankRow[]>(() => {
        const rows = this.dataService.isRange()
            ? (this.dataService.range()?.statistics.cbd ?? []).map((row) => ({ name: row.name, count: row.total }))
            : (this.dataService.history()?.statistics.cbd ?? []).map((row) => ({ name: row.name, count: row.daily }));
        const total = rows.reduce((sum, row) => sum + row.count, 0);
        return rows
            .filter((row) => row.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, IncidentHistoryComponent.CBD_RANK_LIMIT)
            .map((row) => ({ ...row, share: `${((row.count / total) * 100).toFixed(1)}%` }));
    });
    private static readonly CBD_RANK_LIMIT = 10;
    protected readonly skeletonCbdRankRows = IncidentHistoryComponent.placeholders<CbdRankRow>(IncidentHistoryComponent.CBD_RANK_LIMIT);

    private readonly incidents = computed(() => (this.dataService.isRange() ? this.dataService.range()?.incidents : this.dataService.history()?.incidents) ?? []);

    // Set only when a range's list was cut short.
    protected readonly listCut = computed(() => {
        const range = this.dataService.isRange() && !this.dataService.loading() ? this.dataService.range() : null;
        return range && range.incidents_total > range.incidents.length ? { shown: range.incidents.length, total: range.incidents_total } : null;
    });

    // The header's words for what is chosen, e.g. "01/01/2569 – 31/03/2569
    // (90 วัน)" or "วันที่ 23, 24, 25/09/2569".
    protected readonly rangeLabel = computed(() => {
        const selection = this.dataService.rangeSelection();
        if (!selection) return '';
        if (selection.kind === 'range') {
            const days = Math.round((selection.to.getTime() - selection.from.getTime()) / 86_400_000) + 1;
            return `${formatBuddhistDay(selection.from)} – ${formatBuddhistDay(selection.to)} (${days} วัน)`;
        }
        const dates = selection.dates;
        const first = dates[0];
        const sameMonth = dates.every((d) => d.getMonth() === first.getMonth() && d.getFullYear() === first.getFullYear());
        if (sameMonth && dates.length <= 5) return `วันที่ ${dates.map((d) => d.getDate()).join(', ')}/${formatBuddhistDay(first).slice(3)}`;
        return `${dates.length} วัน (${formatBuddhistDay(first)} – ${formatBuddhistDay(dates[dates.length - 1])})`;
    });

    protected shortIsoDate(isoDate: string): string {
        return formatBuddhistDay(parseIsoDate(isoDate));
    }

    // Placeholder rows shown while the stream has not delivered a snapshot.
    // Without them these tables render bare headers, and the top-days table
    // fires its #emptymessage - stating there is no data before anything has
    // been asked for.
    //
    // The counts are per table rather than one shared value because every
    // one of these tables has a fixed height: each row count comes from the
    // lookup tables, which do not change at runtime. Using a single count
    // made the CBD card jump 754px and the case-type card shrink 138px when
    // the data landed.
    private static placeholders<T>(count: number): T[] {
        return Array.from({ length: count }, () => ({}) as T);
    }

    protected readonly PAGE_SIZE = 10;
    protected readonly isPageFiller = isPageFiller;
    protected readonly skeletonIncidentRows = IncidentHistoryComponent.placeholders<IncidentHistoryItem>(this.PAGE_SIZE);

    // Padded to whole pages so a short last page does not move the paginator
    // (see page-filler.ts). Only the unfiltered value can be padded here: the
    // column filters run inside the table and drop fillers, whose fields
    // match nothing, so a filtered result is padded in padFilteredRows.
    protected readonly incidentRows = computed<(IncidentHistoryItem | PageFillerRow)[]>(() =>
        this.dataService.loading() ? this.skeletonIncidentRows : padToPage(this.incidents(), this.PAGE_SIZE)
    );

    // Runs after the table has filtered but before it renders (onFilter is
    // emitted at the end of the filter pass). `filteredValue` is the array the
    // table renders from, so fillers pushed onto it complete the last page.
    // Null means no filter is active and the padded value is in use. An empty
    // result stays empty: "no match" is worth more there than a page of dashes.
    padFilteredRows(table: Table): void {
        const filtered = table.filteredValue as (IncidentHistoryItem | PageFillerRow)[] | null;
        if (filtered?.length) filtered.push(...pageFillers(filtered.length, this.PAGE_SIZE));
    }
    protected readonly skeletonDayRows = IncidentHistoryComponent.placeholders<TopDayItem>(5); // top_days limit
    protected readonly skeletonCallTypeRows = IncidentHistoryComponent.placeholders<StatRow>(6); // 5 call types + total
    protected readonly skeletonChannelRows = IncidentHistoryComponent.placeholders<StatRow>(3);
    protected readonly skeletonCaseTypeRows = IncidentHistoryComponent.placeholders<StatRow>(2);
    protected readonly skeletonSeverityRows = IncidentHistoryComponent.placeholders<StatRow>(5);
    protected readonly skeletonCbdRows = IncidentHistoryComponent.placeholders<StatRow>(25);

    hourOptions: { label: string; value: string }[] = [];

    private readonly incidentTable = viewChild.required<Table>('incidentTable');

    constructor() {
        // Back to page 1 whenever a new day is requested. The table keeps its
        // page across value changes, so a user on page 9 who switches to a day
        // with 8 pages would otherwise land on an empty page 9. Keyed on
        // loading rather than on the incidents themselves because the snapshot
        // is a live stream - a tick must not throw the user back to page 1.
        effect(() => {
            if (this.dataService.loading()) this.incidentTable().first = 0;
        });
    }

    ngOnInit() {
        this.hourOptions = Array.from({ length: 24 }, (_, i) => ({
            label: `${i.toString().padStart(2, '0')}:00 - ${i.toString().padStart(2, '0')}:59`,
            value: i.toString().padStart(2, '0')
        }));
    }

    clear(incidentTable: Table) {
        incidentTable.clear();
    }

    // Switch the page to one of the month's top days. Same call and same
    // toast as the date dial's picker; this card sits below a ten-row table,
    // so the page also scrolls up to where the changed data starts.
    // No marker in the several-days view: every row there is a way into one day.
    protected readonly viewedDay = computed(() => (this.dataService.isRange() ? null : (this.dataService.context()?.operational_day ?? null)));

    viewDay(isoDate: string): void {
        const date = parseIsoDate(isoDate);
        this.dataService.select(date);
        this.messageService.add({ severity: 'success', summary: 'สลับวัน', detail: `เลือกวัน: ${formatBuddhistDay(date)}` });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Same toast as the date dial's วันปัจจุบัน, which does the same thing.
    protected resetToCurrent(): void {
        this.dataService.selectCurrent();
        this.messageService.add({ severity: 'success', summary: 'วันปัจจุบัน', detail: 'กำลังดูข้อมูลวันนี้' });
    }

    protected readonly longDate = computed(() => formatThaiLongDate(this.dataService.selectedDate()));
    protected readonly shortDate = computed(() => formatThaiShortDate(this.dataService.selectedDate()));

    formatDay(isoDate: string): string {
        return parseIsoDate(isoDate).toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // Everything the page shows as numbers, as one CSV: the choice, then the
    // per-day counts (several days only), then each breakdown table under its
    // own heading with the columns on screen. With a BOM, as the flood
    // export has, so Excel on Windows reads the Thai.
    exportCsv(): void {
        const range = this.dataService.isRange() ? this.dataService.range() : null;
        const cell = (value: unknown) => {
            const text = String(value ?? '');
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        };
        const line = (...values: unknown[]) => values.map(cell).join(',');
        const columns = this.statColumns();
        const lines: string[] = [line('สรุปผลทั้งหมด', range ? this.rangeLabel() : this.longDate()), ''];

        if (range) {
            lines.push(line('จำนวนเหตุการณ์ต่อวัน'), line('วันที่', 'จำนวน'));
            for (const day of range.per_day) lines.push(line(this.shortIsoDate(day.operational_day), day.count));
            lines.push(line('รวม', range.per_day.reduce((sum, day) => sum + day.count, 0)), '');
        }

        lines.push(line('CBD ที่มีเหตุเกิดมากที่สุด'), line('อันดับ', 'CBD', 'จำนวน', 'สัดส่วน'));
        this.cbdRanking().forEach((row, i) => lines.push(line(i + 1, row.name, row.count, row.share)));
        lines.push('');

        const tables: [string, StatRow[]][] = [
            ['ประเภท', this.callTypeStatistics()],
            ['ช่องทางการแจ้งเหตุ', this.reportingChannelStatistics()],
            ['ประเภทของการเจ็บป่วย', this.caseTypeStatistics()],
            ['ระดับความรุนแรง', this.severityLevelStatistics()],
            ['CBD 25', this.cbdCategoryStatistics()]
        ];
        for (const [title, rows] of tables) {
            lines.push(line(title), line('ชื่อ', ...columns.map((column) => column.label)));
            for (const row of rows) lines.push(line(row.name, ...columns.map((column) => row[column.key])));
            lines.push('');
        }

        const days = range?.context.days ?? [this.dataService.context()?.operational_day ?? ''];
        const stamp = (iso: string) => iso.replace(/-/g, '');
        const name = days.length > 1 ? `summary-${stamp(days[0])}-${stamp(days[days.length - 1])}.csv` : `summary-${stamp(days[0])}.csv`;
        const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
    }

    getSeverity(severity: string) {
        switch (severity) {
            case 'แดง': return 'danger';
            case 'เหลือง': return 'warn';
            case 'เขียว': return 'success';
            case 'ขาว': return 'secondary';
            case 'ดำ': return 'contrast';
            default: return 'info';
        }
    }
}
