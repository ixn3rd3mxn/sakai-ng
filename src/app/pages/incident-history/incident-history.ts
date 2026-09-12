import { Component, OnInit, computed, effect, inject, viewChild } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { MultiSelectModule } from 'primeng/multiselect';
import { Table, TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { IncidentHistoryItem, IncidentStatItem, TopDayItem } from './incident-history.types';
import { IncidentHistoryDataService } from './services/incident-history-data.service';
import { IncidentHistoryDateDial } from './components/incident-history-date-dial';
import { TooltipModule } from 'primeng/tooltip';
import { formatThaiLongDate, formatThaiShortDate, parseIsoDate } from '../dashboardclone/services/date-utils';
import { PageFillerRow, isPageFiller, padToPage, pageFillers } from '../dashboardclone/services/page-filler';

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
        TooltipModule,
        ScrollTopModule,
        SkeletonModule
    ],
    providers: [IncidentHistoryDataService],
    template: `
        <!-- Same header row the dashboard puts above its grid (see
             incident-type-stats-widget.ts): the day being shown, and the
             back-dated warning when it is one, on a line of its own above the
             cards - not inside the first card. No shift here - this page is
             day-scoped (see incident-history-date-dial.ts). -->
        <div class="flex flex-wrap items-baseline gap-x-2 mb-4">
            <span class="font-semibold text-xl">สรุปผลทั้งหมด</span>
            @if (!dataService.isCurrent()) {
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
                    (onClick)="dataService.selectCurrent()"
                />
            } @else {
                <span class="text-muted-color whitespace-nowrap">{{ longDate() }}</span>
            }
        </div>

        <div class="card" style="margin-bottom: 0.25rem">
            <div class="flex justify-between items-center mb-4">
                <div class="font-semibold text-xl">รายการเหตุการณ์</div>
                <button pButton label="Clear" class="p-button-outlined" icon="pi pi-filter-slash" (click)="clear(incidentTable)"></button>
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
                                เวลา
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
                        <td>{{ incident.time }}</td>
                        <td>{{ incident.call_type }}</td>
                        <td>{{ incident.reporting_channel }}</td>
                        <td>{{ incident.case_type }}</td>
                        <!-- Full "CBD7 <description>" label, cut with an ellipsis at
                             the column's width; the title carries the whole thing.
                             A block span rather than styles on the td: an auto-layout
                             table does not honour max-width on a cell, but it does
                             size the cell to a block child that has one. -->
                        <td><span class="cbd-label" [title]="dataService.cbdLabel(incident.cbd)">{{ dataService.cbdLabel(incident.cbd) }}</span></td>
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
        <div class="font-semibold text-xl mb-4">วันที่บันทึกสูงสุดในเดือนนี้</div>
        <p-table [value]="dataService.loading() ? skeletonDayRows : topDays()" stripedRows [rowHover]="true" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width: 7rem">อันดับ</th>
                    <th style="min-width: 13rem">วันที่</th>
                    <th style="min-width: 13rem">จำนวน</th>
                    <!-- Switch-to-day control; a heading would only repeat the
                         button's tooltip. -->
                    <th style="min-width: 6rem"></th>
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
                        <!-- Inline, not Tailwind's text-right: PrimeNG's own
                             td { text-align: start } is unlayered CSS, and this
                             project loads Tailwind's utilities in a layer, so any
                             utility loses to it. -->
                        <td style="text-align: right">
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

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภท</div>
        <p-table [value]="dataService.loading() ? skeletonCallTypeRows : callTypeStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:356px">ชื่อ</th>
                    <th style="min-width:100px">ต่อเวรเช้า</th>
                    <th style="min-width:100px">ต่อเวรบ่าย</th>
                    <th style="min-width:100px">ต่อเวรดึก</th>
                    <th style="min-width:100px">ต่อวัน</th>
                    <th style="min-width:100px">ต่อสัปดาห์</th>
                    <th style="min-width:100px">ต่อเดือน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.shift_morning }}</td>
                        <td>{{ item.shift_afternoon }}</td>
                        <td>{{ item.shift_night }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
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
                    <th style="min-width:356px">ชื่อ</th>
                    <th style="min-width:100px">ต่อเวรเช้า</th>
                    <th style="min-width:100px">ต่อเวรบ่าย</th>
                    <th style="min-width:100px">ต่อเวรดึก</th>
                    <th style="min-width:100px">ต่อวัน</th>
                    <th style="min-width:100px">ต่อสัปดาห์</th>
                    <th style="min-width:100px">ต่อเดือน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.shift_morning }}</td>
                        <td>{{ item.shift_afternoon }}</td>
                        <td>{{ item.shift_night }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
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
                    <th style="min-width:356px">ชื่อ</th>
                    <th style="min-width:100px">ต่อเวรเช้า</th>
                    <th style="min-width:100px">ต่อเวรบ่าย</th>
                    <th style="min-width:100px">ต่อเวรดึก</th>
                    <th style="min-width:100px">ต่อวัน</th>
                    <th style="min-width:100px">ต่อสัปดาห์</th>
                    <th style="min-width:100px">ต่อเดือน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.shift_morning }}</td>
                        <td>{{ item.shift_afternoon }}</td>
                        <td>{{ item.shift_night }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
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
                    <th style="min-width:356px">ชื่อ</th>
                    <th style="min-width:100px">ต่อเวรเช้า</th>
                    <th style="min-width:100px">ต่อเวรบ่าย</th>
                    <th style="min-width:100px">ต่อเวรดึก</th>
                    <th style="min-width:100px">ต่อวัน</th>
                    <th style="min-width:100px">ต่อสัปดาห์</th>
                    <th style="min-width:100px">ต่อเดือน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.shift_morning }}</td>
                        <td>{{ item.shift_afternoon }}</td>
                        <td>{{ item.shift_night }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
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
                    <th style="min-width:356px">ชื่อ</th>
                    <th style="min-width:100px">ต่อเวรเช้า</th>
                    <th style="min-width:100px">ต่อเวรบ่าย</th>
                    <th style="min-width:100px">ต่อเวรดึก</th>
                    <th style="min-width:100px">ต่อวัน</th>
                    <th style="min-width:100px">ต่อสัปดาห์</th>
                    <th style="min-width:100px">ต่อเดือน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item>
                @if (dataService.loading()) {
                    <tr>
                        <td><p-skeleton width="min(14rem, 90%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                        <td><p-skeleton width="min(2.5rem, 80%)" /></td>
                    </tr>
                } @else {
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.shift_morning }}</td>
                        <td>{{ item.shift_afternoon }}</td>
                        <td>{{ item.shift_night }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                }
            </ng-template>
        </p-table>
    </div>
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
        .cbd-label {
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

    protected callTypeStatistics = computed(() => this.dataService.history()?.statistics.call_type ?? []);
    protected reportingChannelStatistics = computed(() => this.dataService.history()?.statistics.reporting_channel ?? []);
    protected caseTypeStatistics = computed(() => this.dataService.history()?.statistics.case_type ?? []);
    protected severityLevelStatistics = computed(() => this.dataService.history()?.statistics.severity ?? []);
    protected cbdCategoryStatistics = computed(() => this.dataService.history()?.statistics.cbd ?? []);
    protected topDays = computed(() => this.dataService.history()?.top_days ?? []);

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
        this.dataService.loading() ? this.skeletonIncidentRows : padToPage(this.dataService.history()?.incidents ?? [], this.PAGE_SIZE)
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
    protected readonly skeletonCallTypeRows = IncidentHistoryComponent.placeholders<IncidentStatItem>(6); // 5 call types + total
    protected readonly skeletonChannelRows = IncidentHistoryComponent.placeholders<IncidentStatItem>(3);
    protected readonly skeletonCaseTypeRows = IncidentHistoryComponent.placeholders<IncidentStatItem>(2);
    protected readonly skeletonSeverityRows = IncidentHistoryComponent.placeholders<IncidentStatItem>(5);
    protected readonly skeletonCbdRows = IncidentHistoryComponent.placeholders<IncidentStatItem>(25);

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

    // Switch the page to one of the month's top days. Same call the date
    // dial's picker makes; the header line at the top changing to the
    // back-dated notice is the feedback, as it is for the refresh button up
    // there, and this card sits below a ten-row table, so the page scrolls up
    // to where the changed data starts.
    protected readonly viewedDay = computed(() => this.dataService.context()?.operational_day ?? null);

    viewDay(isoDate: string): void {
        this.dataService.select(parseIsoDate(isoDate));
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
