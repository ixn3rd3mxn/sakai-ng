import { Component, OnInit } from '@angular/core';
import { MultiSelectModule } from 'primeng/multiselect';
import { Table, TableModule } from 'primeng/table';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

// Interface for emergency incident data
interface EmergencyIncident {
    id: string;
    time: string;   // เวลาเต็ม (เช่น "22:25")
    hour: string;   // ชั่วโมงเพียงอย่างเดียว (เช่น "22")
    callType: string;
    reportingChannel: string;
    caseType: string;
    cbd: string;
    severity: string;
}

interface IncidentStatistics {
    name: string;
    shiftMorning: number;   // ต่อเวรเช้า
    shiftAfternoon: number; // ต่อเวรบ่าย
    shiftNight: number;     // ต่อเวรดึก
    daily: number;
    weekly: number;
    monthly: number;
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
        ButtonModule
    ],
    template: `        <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ประวัติการบันทึกประจำวัน</div>
            <p-table
                #incidentTable
                [value]="emergencyIncidents"
                stripedRows
                dataKey="id"
                [rows]="10"
                [loading]="loading"
                [rowHover]="true"
                [paginator]="true"
                responsiveLayout="scroll"
            >
                <ng-template #caption>
                    <div class="flex justify-between items-center flex-column sm:flex-row">
                        <button pButton label="Clear" class="p-button-outlined" icon="pi pi-filter-slash" (click)="clear(incidentTable)"></button>
                    </div>
                </ng-template>
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
                        <th style="min-width: 12rem">
                            <div class="flex justify-between items-center">
                                ประเภท
                                <p-columnFilter field="callType" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [options]="callTypeOptions"
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
                                <p-columnFilter field="reportingChannel" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [options]="reportingChannelOptions"
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
                                ประเภทการเจ็บป่วย
                                <p-columnFilter field="caseType" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [options]="caseTypeOptions"
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
                                            [options]="cbdOptions"
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
                                ระดับความรุนแรง
                                <p-columnFilter field="severity" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect
                                            [ngModel]="value"
                                            [options]="severityOptions"
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
                        <td>{{ incident.callType }}</td>
                        <td>{{ incident.reportingChannel }}</td>
                        <td>{{ incident.caseType }}</td>
                        <td>{{ incident.cbd }}</td>
                        <td>
                            <p-tag [value]="incident.severity" [severity]="getSeverity(incident.severity)" styleClass="dark:bg-surface-900!"></p-tag>
                        </td>
                    </tr>
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td colspan="6">ไม่พบข้อมูล</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภท</div>
        <p-table [value]="callTypeStatistics" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                    <td>{{ item.shiftMorning }}</td>
                    <td>{{ item.shiftAfternoon }}</td>
                    <td>{{ item.shiftNight }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ช่องทางการแจ้งเหตุ</div>
        <p-table [value]="reportingChannelStatistics" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                    <td>{{ item.shiftMorning }}</td>
                    <td>{{ item.shiftAfternoon }}</td>
                    <td>{{ item.shiftNight }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ประเภทของการเจ็บป่วย</div>
        <p-table [value]="caseTypeStatistics" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                    <td>{{ item.shiftMorning }}</td>
                    <td>{{ item.shiftAfternoon }}</td>
                    <td>{{ item.shiftNight }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">ระดับความรุนแรง</div>
        <p-table [value]="severityLevelStatistics" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
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
                    <td>{{ item.shiftMorning }}</td>
                    <td>{{ item.shiftAfternoon }}</td>
                    <td>{{ item.shiftNight }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>

    <div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">CBD 25</div>
        <p-table [value]="cbdCategoryStatistics" stripedRows [scrollable]="true" [rowHover]="true" styleClass="mt-4">
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
                    <td>{{ item.shiftMorning }}</td>
                    <td>{{ item.shiftAfternoon }}</td>
                    <td>{{ item.shiftNight }}</td>
                    <td>{{ item.daily }}</td>
                    <td>{{ item.weekly }}</td>
                    <td>{{ item.monthly }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>
    `,
    styles: `
        .p-datatable-frozen-tbody {
            font-weight: bold;
        }

        .p-datatable-scrollable .p-frozen-column {
            font-weight: bold;
        }
    `
})
export class IncidentHistoryComponent implements OnInit {
    emergencyIncidents: EmergencyIncident[] = [];
    loading: boolean = false;

    callTypeOptions: string[] = [];          // ประเภท
    reportingChannelOptions: string[] = []; // ช่องทางแจ้ง
    caseTypeOptions: string[] = [];     // ประเภทการเจ็บป่วย
    cbdOptions: string[] = [];          // CBD
    severityOptions: string[] = [];     // ระดับความรุนแรง

    // Mock data for each table
    callTypeStatistics: IncidentStatistics[] = [
        { name: 'ผลรวมทั้งหมด', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'แจ้งเหตุ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'แจ้งซ้ำเหตุเดิม', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'ปรึกษา', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'สายหลุด', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'ก่อกวน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 }
    ];

    reportingChannelStatistics: IncidentStatistics[] = [
        { name: '1669', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: '2nd', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'วิทยุ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 }
    ];

    caseTypeStatistics: IncidentStatistics[] = [
        { name: 'Trauma', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'Non-Trauma', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 }
    ];

    cbdCategoryStatistics: IncidentStatistics[] = [
        { name: 'CBD1 ปวดท้อง หลัง เชิงกราน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD2 อาการภูมิแพ้ อนาไฟแลกซิส', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD3 สัตว์กัด', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD4 เลือดออก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD5 หายใจลำบาก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD6 หัวใจหยุดเต้น', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD7 เจ็บแน่นหน้าอก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD8 อุดกั้นทางเดินหายใจ / สำลัก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD9 เบาหวาน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD10 ภยันตรายจากสภาพแวดล้อม', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD11 ไม่มีข้อมูล', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD12 ปวดศีรษะ ลำคอ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD13 คลุ้มคลั่ง จิตประสาท', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD14 สารพิษ ยาเกินขนาด', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD15 คลอด นรีเวช', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD16 ชัก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD17 อ่อนเพลีย', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD18 แขนขาอ่อนแรง พูดลำบาก ปากเบี้ยว', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD19 หมดสติ วูบ เป็นลม', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD20 เด็ก ทารก', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD21 ถูกทำร้าย / บาดเจ็บ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD22 ไฟไหม้ / อุบัติเหตุจากการลวก / ไฟช็อต', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD23 ตกน้ำ / จมน้ำ / บาดเจ็บเหตุดำน้ำ / บาดเจ็บทางน้ำ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD24 พลัดตก หกล้ม', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD25 อุบัติเหตุจราจร', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 }
    ];

    severityLevelStatistics: IncidentStatistics[] = [
        { name: 'แดง ฉุกเฉินวิกฤติ', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'เหลือง ฉุกเฉินเร่งด่วน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'เขียว ฉุกเฉินไม่เร่งด่วน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'ขาว เจ็บป่วยไม่ฉุกเฉิน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 },
        { name: 'ดำ ไม่มีการตอบสนอง / ไม่พบผู้ป่วยฉุกเฉิน', shiftMorning: 11, shiftAfternoon: 22, shiftNight: 33, daily: 111, weekly: 222, monthly: 333 }
    ];

    hourOptions: { label: string; value: string }[] = [];

    ngOnInit() {
        this.loading = true;

        this.hourOptions = Array.from({ length: 24 }, (_, i) => ({
            label: `${i.toString().padStart(2, '0')}:00 - ${i.toString().padStart(2, '0')}:59`,
            value: i.toString().padStart(2, '0')  // ค่าเป็น "22" (ไม่มี :)
        }));

        this.emergencyIncidents = [
            { id: 'INC-01', time: '08:15', hour: '08', callType: 'แจ้งเหตุ', reportingChannel: '1669', caseType: 'Trauma', cbd: 'CBD5', severity: 'แดง' },
            { id: 'INC-02', time: '09:22', hour: '09', callType: 'ปรึกษา', reportingChannel: '2nd', caseType: 'Non-Trauma', cbd: 'CBD12', severity: 'เหลือง' },
            { id: 'INC-03', time: '10:41', hour: '10', callType: 'แจ้งซ้ำเหตุเดิม', reportingChannel: 'วิทยุ', caseType: 'Trauma', cbd: 'CBD3', severity: 'แดง' },
            { id: 'INC-04', time: '11:03', hour: '11', callType: 'สายหลุด', reportingChannel: '1669', caseType: 'Non-Trauma', cbd: 'CBD18', severity: 'เขียว' },
            { id: 'INC-05', time: '13:55', hour: '13', callType: 'ก่อกวน', reportingChannel: '1669', caseType: 'Non-Trauma', cbd: 'CBD25', severity: 'ขาว' },
            { id: 'INC-06', time: '14:30', hour: '14', callType: 'แจ้งเหตุ', reportingChannel: '2nd', caseType: 'Trauma', cbd: 'CBD7', severity: 'แดง' },
            { id: 'INC-07', time: '15:45', hour: '15', callType: 'ปรึกษา', reportingChannel: 'วิทยุ', caseType: 'Non-Trauma', cbd: 'CBD14', severity: 'เหลือง' },
            { id: 'INC-08', time: '16:20', hour: '16', callType: 'แจ้งซ้ำเหตุเดิม', reportingChannel: '1669', caseType: 'Trauma', cbd: 'CBD9', severity: 'แดง' },
            { id: 'INC-09', time: '17:10', hour: '17', callType: 'สายหลุด', reportingChannel: '2nd', caseType: 'Non-Trauma', cbd: 'CBD20', severity: 'เขียว' },
            { id: 'INC-10', time: '18:05', hour: '18', callType: 'ก่อกวน', reportingChannel: 'วิทยุ', caseType: 'Non-Trauma', cbd: 'CBD2', severity: 'ขาว' },
            { id: 'INC-11', time: '19:15', hour: '19', callType: 'แจ้งเหตุ', reportingChannel: '1669', caseType: 'Trauma', cbd: 'CBD11', severity: 'แดง' },
            { id: 'INC-12', time: '20:30', hour: '20', callType: 'ปรึกษา', reportingChannel: '1669', caseType: 'Non-Trauma', cbd: 'CBD15', severity: 'เหลือง' },
            { id: 'INC-13', time: '21:40', hour: '21', callType: 'แจ้งซ้ำเหตุเดิม', reportingChannel: '2nd', caseType: 'Trauma', cbd: 'CBD8', severity: 'แดง' },
            { id: 'INC-14', time: '22:25', hour: '22', callType: 'สายหลุด', reportingChannel: 'วิทยุ', caseType: 'Non-Trauma', cbd: 'CBD19', severity: 'เขียว' },
            { id: 'INC-15', time: '23:10', hour: '23', callType: 'ก่อกวน', reportingChannel: '1669', caseType: 'Non-Trauma', cbd: 'CBD22', severity: 'ดำ' }
        ];

        this.cbdOptions = this.cbdCategoryStatistics
            .map(item => item.name.split(' ')[0]) // "CBD1", "CBD2", ...
            .sort((a, b) => {
                const numA = parseInt(a.replace('CBD', ''), 10);
                const numB = parseInt(b.replace('CBD', ''), 10);
                return numA - numB;
            });
        // TODO: แทนที่ด้วยข้อมูลจาก Master Data เมื่อมี backend integration
        this.callTypeOptions = ['ก่อกวน', 'ปรึกษา', 'สายหลุด', 'แจ้งซ้ำเหตุเดิม', 'แจ้งเหตุ'].sort();
        this.reportingChannelOptions = ['1669', '2nd', 'วิทยุ'].sort();
        this.caseTypeOptions = ['Non-Trauma', 'Trauma'].sort();
        this.severityOptions = this.severityLevelStatistics
            .map(item => item.name.split(' ')[0]) // ใช้คำแรก (เช่น "แดง")
            .sort();

        this.loading = false;
    }

    clear(incidentTable: Table) {
        incidentTable.clear();
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