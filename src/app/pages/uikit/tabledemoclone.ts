import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { Table, TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ToastModule } from 'primeng/toast';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { RatingModule } from 'primeng/rating';
import { RippleModule } from 'primeng/ripple';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { TagModule } from 'primeng/tag';
import { Customer, CustomerService, Representative } from '@/app/pages/service/customer.service';
import { Product, ProductService } from '@/app/pages/service/product.service';
import {ObjectUtils} from "primeng/utils";

interface expandedRows {
    [key: string]: boolean;
}

interface TableData {
    name: string;
    daily: number;
    weekly: number;
    monthly: number;
}

@Component({
    selector: 'app-table-demo_clone',
    standalone: true,
    imports: [
        TableModule,
        MultiSelectModule,
        SelectModule,
        InputIconModule,
        TagModule,
        InputTextModule,
        SliderModule,
        ProgressBarModule,
        ToggleButtonModule,
        ToastModule,
        CommonModule,
        FormsModule,
        ButtonModule,
        RatingModule,
        RippleModule,
        IconFieldModule
    ],
    template: `        <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ประวัติการบันทึกประจำวัน</div>
            <p-table
                #dt1
                [value]="customers1"
                stripedRows
                dataKey="id"
                [rows]="10"
                [loading]="loading"
                [rowHover]="true"
                [paginator]="true"
                [globalFilterFields]="['name', 'country.name', 'representative.name', 'status']"
                responsiveLayout="scroll"
            >
                <ng-template #caption>
                    <div class="flex justify-between items-center flex-column sm:flex-row">
                        <button pButton label="Clear" class="p-button-outlined" icon="pi pi-filter-slash" (click)="clear(dt1)"></button>
                    </div>
                </ng-template>
                <ng-template #header>
                    <tr>
                        <th style="min-width: 12rem">
                            <div class="flex justify-between items-center">
                                เวลา
                                <p-columnFilter type="date" field="date" display="menu" placeholder="mm/dd/yyyy"></p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 12rem">
                            <div class="flex justify-between items-center">
                                ประเภท
                                <p-columnFilter field="representative" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #header>
                                        <div class="px-3 pt-3 pb-0">
                                            <span class="font-bold">Agent Picker</span>
                                        </div>
                                    </ng-template>
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect [ngModel]="value" [options]="representatives" placeholder="Any" (onChange)="filter($event.value)" optionLabel="name" styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2 w-44">
                                                    <span>{{ option.name }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 13rem">
                            <div class="flex justify-between items-center">
                                ช่องทางการแจ้งเหตุ
                                <p-columnFilter field="representative" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #header>
                                        <div class="px-3 pt-3 pb-0">
                                            <span class="font-bold">Agent Picker</span>
                                        </div>
                                    </ng-template>
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect [ngModel]="value" [options]="representatives" placeholder="Any" (onChange)="filter($event.value)" optionLabel="name" styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2 w-44">
                                                    <span>{{ option.name }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 15rem">
                            <div class="flex justify-between items-center">
                                ประเภทของการเจ็บป่วย
                                <p-columnFilter field="representative" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #header>
                                        <div class="px-3 pt-3 pb-0">
                                            <span class="font-bold">Agent Picker</span>
                                        </div>
                                    </ng-template>
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect [ngModel]="value" [options]="representatives" placeholder="Any" (onChange)="filter($event.value)" optionLabel="name" styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2 w-44">
                                                    <span>{{ option.name }}</span>
                                                </div>
                                            </ng-template>
                                        </p-multiselect>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                        <th style="min-width: 10rem">
                            <div class="flex justify-between items-center">
                                CBD 25
                                <p-columnFilter field="representative" matchMode="in" display="menu" [showMatchModes]="false" [showOperator]="false" [showAddButton]="false">
                                    <ng-template #header>
                                        <div class="px-3 pt-3 pb-0">
                                            <span class="font-bold">Agent Picker</span>
                                        </div>
                                    </ng-template>
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-multiselect [ngModel]="value" [options]="representatives" placeholder="Any" (onChange)="filter($event.value)" optionLabel="name" styleClass="w-full">
                                            <ng-template let-option #item>
                                                <div class="flex items-center gap-2 w-44">
                                                    <span>{{ option.name }}</span>
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
                                <p-columnFilter field="status" matchMode="equals" display="menu">
                                    <ng-template #filter let-value let-filter="filterCallback">
                                        <p-select [ngModel]="value" [options]="statuses" (onChange)="filter($event.value)" placeholder="Any" [style]="{ 'min-width': '12rem' }">
                                            <ng-template let-option #item>
                                                <span [class]="'customer-badge status-' + option.value">{{ option.label }}</span>
                                            </ng-template>
                                        </p-select>
                                    </ng-template>
                                </p-columnFilter>
                            </div>
                        </th>
                    </tr>
                </ng-template>
                <ng-template #body let-customer>
                    <tr>
                        <td>
                            {{ customer.date | date: 'MM/dd/yyyy' }}
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <span class="image-text">{{ customer.representative.name }}</span>
                            </div>
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <span class="image-text">{{ customer.representative.name }}</span>
                            </div>
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <span class="image-text">{{ customer.representative.name }}</span>
                            </div>
                        </td>
                        <td>
                            <div class="flex items-center gap-2">
                                <span class="image-text">{{ customer.representative.name }}</span>
                            </div>
                        </td>
                        <td>
                            <p-tag [value]="customer.status.toLowerCase()" [severity]="getSeverity(customer.status.toLowerCase())" styleClass="dark:bg-surface-900!" />
                        </td>
                    </tr>
                </ng-template>
                <ng-template #emptymessage>
                    <tr>
                        <td colspan="8">No customers found.</td>
                    </tr>
                </ng-template>
                <ng-template #loadingbody>
                    <tr>
                        <td colspan="8">Loading customers data. Please wait.</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>
    
    <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ประเภท</div>
            <p-table [value]="categoryTypes" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
                <ng-template #header>
                    <tr>
                        <th style="min-width:356px">ชื่อ</th>
                        <th style="min-width:100px">ต่อวัน</th>
                        <th style="min-width:100px">ต่อสัปดาห์</th>
                        <th style="min-width:100px">ต่อเดือน</th>
                    </tr>
                </ng-template>
                <ng-template #body let-item>
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ช่องทางการแจ้งเหตุ</div>
            <p-table [value]="notificationChannels" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
                <ng-template #header>
                    <tr>
                        <th style="min-width:356px">ชื่อ</th>
                        <th style="min-width:100px">ต่อวัน</th>
                        <th style="min-width:100px">ต่อสัปดาห์</th>
                        <th style="min-width:100px">ต่อเดือน</th>
                    </tr>
                </ng-template>
                <ng-template #body let-item>
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ประเภทของการเจ็บป่วย</div>
            <p-table [value]="injuryTypes" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
                <ng-template #header>
                    <tr>
                        <th style="min-width:356px">ชื่อ</th>
                        <th style="min-width:100px">ต่อวัน</th>
                        <th style="min-width:100px">ต่อสัปดาห์</th>
                        <th style="min-width:100px">ต่อเดือน</th>
                    </tr>
                </ng-template>
                <ng-template #body let-item>
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">CBD 25</div>
            <p-table [value]="cbd25" stripedRows [scrollable]="true" [rowHover]="true" styleClass="mt-4">
                <ng-template #header>
                    <tr>
                        <th style="min-width:356px">ชื่อ</th>
                        <th style="min-width:100px">ต่อวัน</th>
                        <th style="min-width:100px">ต่อสัปดาห์</th>
                        <th style="min-width:100px">ต่อเดือน</th>
                    </tr>
                </ng-template>
                <ng-template #body let-item>
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>

    <div class="card" style="margin-bottom: 0.25rem">
            <div class="font-semibold text-xl mb-4">ระดับความรุนแรง</div>
            <p-table [value]="severityLevels" stripedRows [scrollable]="true" [rowHover]="true" scrollHeight="400px" styleClass="mt-4">
                <ng-template #header>
                    <tr>
                        <th style="min-width:356px">ชื่อ</th>
                        <th style="min-width:100px">ต่อวัน</th>
                        <th style="min-width:100px">ต่อสัปดาห์</th>
                        <th style="min-width:100px">ต่อเดือน</th>
                    </tr>
                </ng-template>
                <ng-template #body let-item>
                    <tr>
                        <td>{{ item.name }}</td>
                        <td>{{ item.daily }}</td>
                        <td>{{ item.weekly }}</td>
                        <td>{{ item.monthly }}</td>
                    </tr>
                </ng-template>
            </p-table>
        </div>`,
    styles: `
        .p-datatable-frozen-tbody {
            font-weight: bold;
        }

        .p-datatable-scrollable .p-frozen-column {
            font-weight: bold;
        }
    `,
    providers: [ConfirmationService, MessageService, CustomerService, ProductService]
})
export class TableDemoClone implements OnInit {
    customers1: Customer[] = [];

    // Mock data for each table
    categoryTypes: TableData[] = [
        { name: 'ผลรวมทั้งหมด', daily: 111, weekly: 222, monthly: 333 },
        { name: 'แจ้งเหตุ', daily: 111, weekly: 222, monthly: 333 },
        { name: 'แจ้งซ้ำเหตุเดิม', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ปรึกษา', daily: 111, weekly: 222, monthly: 333 },
        { name: 'สายหลุด', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ก่อกวน', daily: 111, weekly: 222, monthly: 333 }
    ];

    notificationChannels: TableData[] = [
        { name: '1669', daily: 111, weekly: 222, monthly: 333 },
        { name: '2nd', daily: 111, weekly: 222, monthly: 333 },
        { name: 'วิทยุ', daily: 111, weekly: 222, monthly: 333 }
    ];

    injuryTypes: TableData[] = [
        { name: 'Trauma', daily: 111, weekly: 222, monthly: 333 },
        { name: 'Non-Trauma', daily: 111, weekly: 222, monthly: 333 }
    ];

    cbd25: TableData[] = [
        { name: 'CBD1 ปวดท้อง หลัง เชิงกราน', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD2 อาการภูมิแพ้ อนาไฟแลกซิส', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD3 สัตว์กัด', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD4 เลือดออก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD5 หายใจลำบาก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD6 หัวใจหยุดเต้น', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD7 เจ็บแน่นหน้าอก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD8 อุดกั้นทางเดินหายใจ / สำลัก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD9 เบาหวาน', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD10 ภยันตรายจากสภาพแวดล้อม', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD11 ไม่มีข้อมูล', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD12 ปวดศีรษะ ลำคอ', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD13 คลุ้มคลั่ง จิตประสาท', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD14 สารพิษ ยาเกินขนาด', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD15 คลอด นรีเวช', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD16 ชัก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD17 อ่อนเพลีย', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD18 แขนขาอ่อนแรง พูดลำบาก ปากเบี้ยว', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD19 หมดสติ วูบ เป็นลม', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD20 เด็ก ทารก', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD21 ถูกทำร้าย / บาดเจ็บ', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD22 ไฟไหม้ / อุบัติเหตุจากการลวก / ไฟช็อต', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD23 ตกน้ำ / จมน้ำ / บาดเจ็บเหตุดำน้ำ / บาดเจ็บทางน้ำ', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD24 พลัดตก หกล้ม', daily: 111, weekly: 222, monthly: 333 },
        { name: 'CBD25 อุบัติเหตุจราจร', daily: 111, weekly: 222, monthly: 333 }
    ];

    severityLevels: TableData[] = [
        { name: 'ระดับที่ 1 สีแดง ฉุกเฉินวิกฤติ', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ระดับที่ 2 สีเหลือง ฉุกเฉินเร่งด่วน', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ระดับที่ 3 สีเขียว ฉุกเฉินไม่เร่งด่วน', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ระดับที่ 4 สีขาว เจ็บป่วยไม่ฉุกเฉิน', daily: 111, weekly: 222, monthly: 333 },
        { name: 'ระดับที่ 5 สีดำ ไม่มีการตอบสนอง / ไม่พบผู้ป่วยฉุกเฉิน', daily: 111, weekly: 222, monthly: 333 }
    ];

    selectedCustomers1: Customer[] = [];

    selectedCustomer: Customer = {};

    representatives: Representative[] = [];

    statuses: any[] = [];

    rowGroupMetadata: any;

    activityValues: number[] = [0, 100];

    loading: boolean = true;

    @ViewChild('filter') filter!: ElementRef;

    constructor(
        private customerService: CustomerService,
    ) {}

    ngOnInit() {
        this.customerService.getCustomersLarge().then((customers) => {
            this.customers1 = customers;
            this.loading = false;

            // @ts-ignore
            this.customers1.forEach((customer) => (customer.date = new Date(customer.date)));
        });

        this.representatives = [
            { name: 'Amy Elsner', image: 'amyelsner.png' },
            { name: 'Anna Fali', image: 'annafali.png' },
            { name: 'Asiya Javayant', image: 'asiyajavayant.png' },
            { name: 'Bernardo Dominic', image: 'bernardodominic.png' },
            { name: 'Elwin Sharvill', image: 'elwinsharvill.png' },
            { name: 'Ioni Bowcher', image: 'ionibowcher.png' },
            { name: 'Ivan Magalhaes', image: 'ivanmagalhaes.png' },
            { name: 'Onyama Limba', image: 'onyamalimba.png' },
            { name: 'Stephen Shaw', image: 'stephenshaw.png' },
            { name: 'Xuxue Feng', image: 'xuxuefeng.png' }
        ];

        this.statuses = [
            { label: 'Unqualified', value: 'unqualified' },
            { label: 'Qualified', value: 'qualified' },
            { label: 'New', value: 'new' },
            { label: 'Negotiation', value: 'negotiation' },
            { label: 'Renewal', value: 'renewal' },
        ];
    }

    onSort() {
        this.updateRowGroupMetaData();
    }

    updateRowGroupMetaData() {
        this.rowGroupMetadata = {};
    }

    onGlobalFilter(table: Table, event: Event) {
        table.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    clear(table: Table) {
        table.clear();
        this.filter.nativeElement.value = '';
    }

    getSeverity(status: string) {
        switch (status) {
            case 'qualified':
                return 'success';

            case 'negotiation':
                return 'warn';

            case 'unqualified':
                return 'danger';

            default:
                return 'info';
        }
    }
}
