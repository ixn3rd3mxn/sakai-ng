import { Component, OnInit, computed, inject } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { MultiSelectModule } from 'primeng/multiselect';
import { Table, TableModule } from 'primeng/table';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { IncidentHistoryDataService } from './services/incident-history-data.service';
import { IncidentHistoryDateDial } from './components/incident-history-date-dial';
import { IncidentHistoryDateBanner } from './components/incident-history-date-banner';
import { parseIsoDate } from '../dashboardclone/services/date-utils';

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
        IncidentHistoryDateBanner,
        ScrollTopModule
    ],
    providers: [IncidentHistoryDataService],
    template: `
        <app-incident-history-date-banner [historical]="!dataService.isCurrent()" [selectedDate]="dataService.selectedDate()" />

        <div class="card" style="margin-bottom: 0.25rem">
            <div class="flex justify-between items-center mb-4">
                <div class="font-semibold text-xl">ประวัติการบันทึกประจำวัน</div>
                <button pButton label="Clear" class="p-button-outlined" icon="pi pi-filter-slash" (click)="clear(incidentTable)"></button>
            </div>
            <p-table
                #incidentTable
                [value]="dataService.history()?.incidents ?? []"
                stripedRows
                dataKey="incident_id"
                [rows]="10"
                [loading]="dataService.loading()"
                [rowHover]="true"
                [paginator]="true"
                responsiveLayout="scroll"
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
                        <th style="min-width: 8rem">
                            <div class="flex justify-between items-center">
                                CBD
                                <p-columnFilter field="cbd" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
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
                    <tr>
                        <td>{{ incident.time }}</td>
                        <td>{{ incident.call_type }}</td>
                        <td>{{ incident.reporting_channel }}</td>
                        <td>{{ incident.case_type }}</td>
                        <td>{{ incident.cbd }}</td>
                        <td>
                            @if (incident.severity === '-') {
                                -
                            } @else {
                                <p-tag [value]="incident.severity" [severity]="getSeverity(incident.severity)"></p-tag>
                            }
                        </td>
                    </tr>
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td colspan="6">ยังไม่มีการบันทึกข้อมูล</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">วันที่มีการบันทึกข้อมูลมากที่สุดในเดือนนี้</div>
        <p-table [value]="topDays()" stripedRows [rowHover]="true" styleClass="mt-4">
            <ng-template #header>
                <tr>
                    <th style="min-width:33%">อันดับ</th>
                    <th style="min-width:33%">วันที่</th>
                    <th style="min-width:33%">จำนวน</th>
                </tr>
            </ng-template>
            <ng-template #body let-item let-rowIndex="rowIndex">
                <tr>
                    <td>{{ rowIndex + 1 }}</td>
                    <td>{{ formatDay(item.operational_day) }}</td>
                    <td>{{ item.count }}</td>
                </tr>
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="3">ยังไม่มีข้อมูล</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภท</div>
        <p-table [value]="callTypeStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.shift_morning }}</td>
                    <td>{{ item.shift_afternoon }}</td>
                    <td>{{ item.shift_night }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ช่องทางการแจ้งเหตุ</div>
        <p-table [value]="reportingChannelStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.shift_morning }}</td>
                    <td>{{ item.shift_afternoon }}</td>
                    <td>{{ item.shift_night }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภทของการเจ็บป่วย</div>
        <p-table [value]="caseTypeStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.shift_morning }}</td>
                    <td>{{ item.shift_afternoon }}</td>
                    <td>{{ item.shift_night }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ระดับความรุนแรง</div>
        <p-table [value]="severityLevelStatistics()" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.shift_morning }}</td>
                    <td>{{ item.shift_afternoon }}</td>
                    <td>{{ item.shift_night }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">CBD 25</div>
        <p-table [value]="cbdCategoryStatistics()" stripedRows [scrollable]="true" [rowHover]="true" styleClass="mt-4">
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
                <tr>
                    <td>{{ item.name }}</td>
                    <td>{{ item.shift_morning }}</td>
                    <td>{{ item.shift_afternoon }}</td>
                    <td>{{ item.shift_night }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>
    <p-scrolltop />
    <app-incident-history-date-dial />
    `,
    styles: `
        :host ::ng-deep .p-scrolltop {
            right: 4.2rem !important;
            bottom: 1rem !important;
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

    hourOptions: { label: string; value: string }[] = [];

    ngOnInit() {
        this.hourOptions = Array.from({ length: 24 }, (_, i) => ({
            label: `${i.toString().padStart(2, '0')}:00 - ${i.toString().padStart(2, '0')}:59`,
            value: i.toString().padStart(2, '0')
        }));
    }

    clear(incidentTable: Table) {
        incidentTable.clear();
    }

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
