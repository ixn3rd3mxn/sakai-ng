import { Component, inject, OnInit, Output, EventEmitter } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService, ConfirmationService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
    standalone: true,
    selector: 'app-speed-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, SelectModule, SelectButtonModule, FormsModule, ConfirmDialogModule, MessageModule, DatePickerModule],
    template: `<p-toast />
    <p-confirmdialog />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem' }" [tooltipOptions]="{ tooltipPosition: 'left' }" />

    <p-dialog header="สลับวันเวลา" [(visible)]="displayDateTime" [breakpoints]="{ '1400px': '21vw', '1100px': '24vw', '960px': '33vw', '500px': '67vw' }" [style]="{ width: '18vw' }" [modal]="true">
        <div class="flex gap-4">
            <div class="flex flex-col gap-1"><div class="font-semibold">เลือกเวร</div><p-select [(ngModel)]="tempSelectedTime" [options]="timeOptions" optionLabel="name" placeholder="เลือกเวร" class="w-full" appendTo="body" /></div>
            <div class="flex flex-col gap-1"><div class="font-semibold">เลือกวัน</div><p-datepicker [(ngModel)]="tempSelectedDate" [minDate]="minDate" [maxDate]="maxDate" [readonlyInput]="true" placeholder="เลือกวัน" class="w-full" appendTo="body" /></div>
        </div>
        <ng-template #footer>
            <p-button label="รีเซ็ต" severity="secondary" (click)="resetDateTime()" />
            <p-button label="ยืนยัน" (click)="confirmDateTime()" />
        </ng-template>
    </p-dialog>

    <p-dialog header="ไม่สามารถบันทึกข้อมูลได้" [(visible)]="displaySaveWarning" [breakpoints]="{ '1400px': '28vw', '1100px': '40vw', '960px': '44vw', '500px': '80vw' }" [style]="{ width: '23vw' }" [modal]="true">
        <div class="flex flex-col gap-4">
            <div>การบันทึกข้อมูลสามารถทำได้เฉพาะเวรและวันที่ปัจจุบันเท่านั้น</div>
            <div>หากต้องการบันทึกข้อมูล กรุณารีเซ็ตกลับเป็นวันเวลาปัจจุบัน</div>
        </div>
        <ng-template #footer>
            <p-button label="รีเซ็ตเป็นปัจจุบัน" severity="secondary" (click)="resetAndOpenSaveDialog()" />
            <p-button label="ตกลง" (click)="displaySaveWarning = false" />
        </ng-template>
    </p-dialog>

    <p-dialog header="บันทึกข้อมูล" [(visible)]="display" [breakpoints]="{ '1400px': '28vw', '1100px': '40vw', '960px': '44vw', '500px': '80vw' }" [style]="{ width: '23vw' }" [modal]="true">
        <div class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
                <div class="font-semibold">ประเภท</div>
                <p-select [(ngModel)]="dropdownValue" [options]="dropdownValues" optionLabel="name" placeholder="เลือกประเภท" appendTo="body" [showClear]="true" [invalid]="isDropdownInvalid" />
                @if (isDropdownInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภท</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ช่องทางการแจ้งเหตุ</div>
                <div class="w-full disabled-field">
                    <p-selectbutton [(ngModel)]="selectButtonValue" [options]="selectButtonValues" optionLabel="name" [disabled]="isFieldsDisabled" [invalid]="isSelectButtonInvalid" />
                </div>
                @if (isSelectButtonInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกช่องทางการแจ้งเหตุ</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ประเภทของการเจ็บป่วย</div>
                <div class="w-full disabled-field">
                    <p-selectbutton [(ngModel)]="traumaSelectButtonValue" [options]="traumaSelectButtonValues" optionLabel="name" [disabled]="isFieldsDisabled" [invalid]="isTraumaInvalid" />
                </div>
                @if (isTraumaInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภทของการเจ็บป่วย</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">CBD</div>
                <div class="w-full disabled-field">
                    <p-select [(ngModel)]="cbdValue" [options]="cbdValues" optionLabel="name" placeholder="เลือก CBD" class="w-full" appendTo="body" [showClear]="true" [disabled]="isFieldsDisabled" [invalid]="isCbdInvalid" />
                </div>
                @if (isCbdInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือก CBD</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ระดับความรุนแรง</div>
                <div class="w-full disabled-field">
                    <p-select [(ngModel)]="severityValue" [options]="severityValues" optionLabel="name" placeholder="เลือกระดับความรุนแรง" class="w-full" appendTo="body" [showClear]="true" [disabled]="isFieldsDisabled" [invalid]="isSeverityInvalid" />
                </div>
                @if (isSeverityInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกระดับความรุนแรง</p-message>
                }
            </div>
        </div>
        <ng-template #footer>
            <p-button label="รีเซ็ต" severity="secondary" (click)="resetForm()" />
            <p-button label="บันทึก" (click)="onSaveClick($event)" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService, ConfirmationService]
})
export class SpeedDial implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    items: MenuItem[] | null = null;
    
    @Output() dateTimeChanged = new EventEmitter<{isCurrent: boolean, date: Date | undefined, time: any}>();
    
    displayDateTime: boolean = false;
    displaySaveWarning: boolean = false;
    selectedDate: Date | undefined = new Date();
    selectedTime: any = null;
    tempSelectedDate: Date | undefined;
    tempSelectedTime: any;
    minDate: Date | undefined;
    maxDate: Date | undefined;
    
    private currentDate: Date = new Date();
    private currentTimePeriod: { name: string } = this.getDefaultTimePeriod();
    timeOptions = [
        { name: 'เช้า' },
        { name: 'บ่าย' },
        { name: 'ดึก' }
    ];

    getDefaultTimePeriod(): { name: string } {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const totalMinutes = hours * 60 + minutes;

        if (totalMinutes >= 0 * 60 + 30 && totalMinutes < 8 * 60 + 30) {
            return { name: 'ดึก' };
        } else if (totalMinutes >= 8 * 60 + 30 && totalMinutes < 16 * 60 + 30) {
            return { name: 'เช้า' };
        } else {
            return { name: 'บ่าย' };
        }
    }
    
    private isSameDay(date1: Date | undefined, date2: Date): boolean {
        if (!date1) return false;
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    }
    
    private checkIsCurrentDateTime(): boolean {
        return this.isSameDay(this.selectedDate, this.currentDate) &&
               this.selectedTime?.name === this.currentTimePeriod?.name;
    }
    
    private _display: boolean = false;
    
    get display(): boolean {
        return this._display;
    }
    
    set display(value: boolean) {
        this._display = value;
        if (value) {
            this.formSubmitted = false;
        } else {

            this._dropdownValue = null;
            this.selectButtonValue = null;
            this.traumaSelectButtonValue = null;
            this.cbdValue = null;
            this.severityValue = null;
            this.formSubmitted = false;
        }
    }
    
    private _dropdownValue: any = null;
    selectButtonValue: any = null;
    traumaSelectButtonValue: any = null;
    cbdValue: any = null;
    severityValue: any = null;

    get dropdownValue(): any {
        return this._dropdownValue;
    }
    
    set dropdownValue(value: any) {
        this._dropdownValue = value;
        this.formSubmitted = false;
        if (value?.code !== 'NY') {
            this.selectButtonValue = null;
            this.traumaSelectButtonValue = null;
            this.cbdValue = null;
            this.severityValue = null;
        }
    }

    dropdownValues = [
        { name: 'แจ้งเหตุ', code: 'NY' },
        { name: 'แจ้งเพิ่มเติม เหตุเดียวกัน', code: 'RM' },
        { name: 'ปรึกษา', code: 'LDN' },
        { name: 'สายหลุด', code: 'IST' },
        { name: 'ก่อกวน', code: 'PRS' }
    ];

    get isFieldsDisabled(): boolean {
        return this.dropdownValue?.code !== 'NY';
    }

    formSubmitted: boolean = false;

    get isDropdownInvalid(): boolean {
        return this.formSubmitted && !this.dropdownValue;
    }

    get isSelectButtonInvalid(): boolean {
        return this.formSubmitted && this.dropdownValue?.code === 'NY' && !this.selectButtonValue;
    }

    get isTraumaInvalid(): boolean {
        return this.formSubmitted && this.dropdownValue?.code === 'NY' && !this.traumaSelectButtonValue;
    }

    get isCbdInvalid(): boolean {
        return this.formSubmitted && this.dropdownValue?.code === 'NY' && !this.cbdValue;
    }

    get isSeverityInvalid(): boolean {
        return this.formSubmitted && this.dropdownValue?.code === 'NY' && !this.severityValue;
    }

    get isFormValid(): boolean {

        if (this.dropdownValue?.code === 'NY') {
            return !!(this.dropdownValue && this.selectButtonValue && this.traumaSelectButtonValue && this.cbdValue && this.severityValue);
        }

        return !!this.dropdownValue;
    }

    selectButtonValues = [
        { name: '1669' },
        { name: '2nd' },
        { name: 'วิทยุ' }
    ];

    traumaSelectButtonValues = [
        { name: 'trauma' },
        { name: 'non-trauma' }
    ];

    cbdValues = [
        { name: 'CBD1 ปวดท้อง หลัง เชิงกราน' },
        { name: 'CBD2 อาการภูมิแพ้ อนาไฟแลกซิส' },
        { name: 'CBD3 สัตว์กัด' },
        { name: 'CBD4 เลือดออก' },
        { name: 'CBD5 หายใจลำบาก' },
        { name: 'CBD6 หัวใจหยุดเต้น' },
        { name: 'CBD7 เจ็บแน่นหน้าอก' },
        { name: 'CBD8 อุดกั้นทางเดินหายใจ / สำลัก' },
        { name: 'CBD9 เบาหวาน' },
        { name: 'CBD10 ภยันตรายจากสภาพแวดล้อม' },
        { name: 'CBD11 ไม่มีข้อมูล' },
        { name: 'CBD12 ปวดศีรษะ ลำคอ' },
        { name: 'CBD13 คลุ้มคลั่ง จิตประสาท' },
        { name: 'CBD14 สารพิษ ยาเกินขนาด' },
        { name: 'CBD15 คลอด นรีเวช' },
        { name: 'CBD16 ชัก' },
        { name: 'CBD17 อ่อนเพลีย' },
        { name: 'CBD18 แขนขาอ่อนแรง พูดลำบาก ปากเบี้ยว' },
        { name: 'CBD19 หมดสติ วูบ เป็นลม' },
        { name: 'CBD20 เด็ก ทารก' },
        { name: 'CBD21 ถูกทำร้าย / บาดเจ็บ' },
        { name: 'CBD22 ไฟไหม้ / อุบัติเหตุจากการลวก / ไฟช็อต' },
        { name: 'CBD23 ตกน้ำ / จมน้ำ / บาดเจ็บเหตุด้าน้ำ / บาดเจ็บทางน้ำ' },
        { name: 'CBD24 พลัดตก หกล้ม' },
        { name: 'CBD25 อุบัติเหตุจราจร' }
    ];

    severityValues = [
        { name: 'ระดับที่ 1 สีแดง ฉุกเฉินวิกฤติ' },
        { name: 'ระดับที่ 2 สีเหลือง ฉุกเฉินเร่งด่วน' },
        { name: 'ระดับที่ 3 สีเขียว ฉุกเฉินไม่เร่งด่วน' },
        { name: 'ระดับที่ 4 สีขาว เจ็บป่วยไม่ฉุกเฉิน' },
        { name: 'ระดับที่ 5 สีดำ ไม่มีการตอบสนอง / ไม่พบผู้ป่วยฉุกเฉิน' }
    ];

    onSaveClick(event: Event) {
        this.formSubmitted = true;
        
        if (!this.isFormValid) {
            this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดกรอกข้อมูลให้ครบทุกช่อง' });
            return;
        }
        
        this.confirmSave(event);
    }

    getConfirmationMessage(): string {
        const parts: string[] = [];
        
        if (this.dropdownValue) {
            parts.push(`<b>ประเภท:</b><br>${this.dropdownValue.name}`);
        }
        
        if (this.dropdownValue?.code === 'NY') {
            if (this.selectButtonValue) {
                parts.push(`<b>ช่องทางการแจ้งเหตุ:</b><br>${this.selectButtonValue.name}`);
            }
            if (this.traumaSelectButtonValue) {
                parts.push(`<b>ประเภทของการเจ็บป่วย:</b><br>${this.traumaSelectButtonValue.name}`);
            }
            if (this.cbdValue) {
                parts.push(`<b>CBD:</b><br>${this.cbdValue.name}`);
            }
            if (this.severityValue) {
                parts.push(`<b>ระดับความรุนแรง:</b><br>${this.severityValue.name}`);
            }
        }
        
        return `<div style="line-height:1.8">คุณต้องการบันทึกข้อมูลต่อไปนี้หรือไม่?<br><br>${parts.join('<br><br>')}</div>`;
    }

    confirmSave(event: Event) {
        this.confirmationService.confirm({
            target: event.target as EventTarget,
            message: this.getConfirmationMessage(),
            header: 'ยืนยันการบันทึก',
            acceptLabel: 'ยืนยัน',
            rejectLabel: 'ยกเลิก',
            rejectButtonProps: {
                severity: 'secondary',
                outlined: true
            },

            accept: () => {
                this.messageService.add({ severity: 'success', summary: 'บันทึกสำเร็จ', detail: 'ข้อมูลได้ถูกบันทึกแล้ว' });
                this.display = false;
                this.formSubmitted = false;
            },
            reject: () => {
                this.messageService.add({ severity: 'warn', summary: 'ยกเลิก', detail: 'การบันทึกถูกยกเลิก' });
            }
        });
    }

    resetForm() {
        this._dropdownValue = null;
        this.selectButtonValue = null;
        this.traumaSelectButtonValue = null;
        this.cbdValue = null;
        this.severityValue = null;
        this.formSubmitted = false;
    }

    close() {
        this.display = false;
    }

    openSaveDialog() {
        if (this.checkIsCurrentDateTime()) {
            this.display = true;
        } else {
            this.displaySaveWarning = true;
        }
    }

    resetAndOpenSaveDialog() {
        this.selectedDate = new Date();
        this.selectedTime = this.getDefaultTimePeriod();
        this.currentDate = new Date();
        this.currentTimePeriod = this.getDefaultTimePeriod();
        
        this.displaySaveWarning = false;
        this.display = true;
        
        this.dateTimeChanged.emit({
            isCurrent: true,
            date: this.selectedDate,
            time: this.selectedTime
        });
    }

    openDateTimeDialog() {
        this.tempSelectedDate = this.selectedDate;
        this.tempSelectedTime = this.selectedTime;
        this.displayDateTime = true;
    }

    closeDateTimeDialog() {
        this.displayDateTime = false;
    }

    resetDateTime() {
        this.tempSelectedDate = new Date();
        this.tempSelectedTime = this.getDefaultTimePeriod();
    }

    confirmDateTime() {
        if (this.tempSelectedDate && this.tempSelectedTime) {
            this.selectedDate = this.tempSelectedDate;
            this.selectedTime = this.tempSelectedTime;
            
            this.messageService.add({ 
                severity: 'success', 
                summary: 'สลับวันเวลา', 
                detail: `เลือกวัน: ${this.selectedDate.toLocaleDateString('th-TH')} เวลา: ${this.selectedTime.name}` 
            });
            this.displayDateTime = false;
            
            const isCurrent = this.checkIsCurrentDateTime();
            this.dateTimeChanged.emit({
                isCurrent: isCurrent,
                date: this.selectedDate,
                time: this.selectedTime
            });
        } else {
            this.messageService.add({ 
                severity: 'error', 
                summary: 'ข้อมูลไม่สมบูรณ์', 
                detail: 'โปรดเลือกวันที่และเวลา' 
            });
        }
    }

    setupDateBoundaries() {
        this.minDate = new Date(2026, 1, 16);
        this.maxDate = new Date(2031, 10, 31);
    }

    ngOnInit() {
        this.setupDateBoundaries();
        this.selectedTime = this.getDefaultTimePeriod();
        
        this.items = [
            {
                label: 'บันทึกข้อมูล',
                icon: 'pi pi-pencil',
                command: () => {
                    this.openSaveDialog();
                }
            },
            {
                label: 'สลับวันเวลา',
                icon: 'pi pi-calendar-clock',
                command: () => {
                    this.openDateTimeDialog();
                }
            },
            {
                label: 'วันเวลาปัจจุบัน',
                icon: 'pi pi-refresh',
                command: () => {
                    this.selectedDate = new Date();
                    this.selectedTime = this.getDefaultTimePeriod();
                    this.currentDate = new Date();
                    this.currentTimePeriod = this.getDefaultTimePeriod();
                    
                    this.messageService.add({ severity: 'success', summary: 'รีเซ็ตเป็นปัจจุบัน', detail: 'กำลังดูข้อมูลปัจจุบัน' });
                    
                    this.dateTimeChanged.emit({
                        isCurrent: true,
                        date: this.selectedDate,
                        time: this.selectedTime
                    });
                }
            },
            // {
            //     label: 'ล็อคหน้าจอ',
            //     icon: 'pi pi-unlock',
            //     routerLink: ['/fileupload']
            // },
            // {
            //     label: 'Angular.dev',
            //     icon: 'pi pi-external-link',
            //     target: '_blank',
            //     url: 'https://angular.dev'
            // }
        ];
    }
}
