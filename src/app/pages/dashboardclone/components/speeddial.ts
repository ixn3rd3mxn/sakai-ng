import { Component, inject, OnInit } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
    standalone: true,
    selector: 'app-speed-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, SelectModule, SelectButtonModule, FormsModule],
    template: `<p-toast />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem' }" [tooltipOptions]="{ tooltipPosition: 'left' }" />
    
    <p-dialog header="บันทึกข้อมูล" [(visible)]="display" [breakpoints]="{ '1400px': '28vw', '1100px': '40vw', '960px': '44vw', '500px': '80vw' }" [style]="{ width: '23vw' }" [modal]="true">
        <div class="flex flex-col gap-4">
            <div class="font-semibold">ประเภท</div>
            <p-select [(ngModel)]="dropdownValue" [options]="dropdownValues" optionLabel="name" placeholder="เลือกประเภท" class="w-full" appendTo="body" [showClear]="true" />
            <div class="font-semibold">ช่องทางการแจ้งเหตุ</div>
            <p-selectbutton [(ngModel)]="selectButtonValue" [options]="selectButtonValues" optionLabel="name" />
            <div class="font-semibold">ประเภทของการเจ็บป่วย</div>
            <p-selectbutton [(ngModel)]="traumaSelectButtonValue" [options]="traumaSelectButtonValues" optionLabel="name" />
            <div class="font-semibold">CBD</div>
            <p-select [(ngModel)]="cbdValue" [options]="cbdValues" optionLabel="name" placeholder="เลือก CBD" class="w-full" appendTo="body" [showClear]="true" />
            <div class="font-semibold">ระดับความรุนแรง</div>
            <p-select [(ngModel)]="severityValue" [options]="severityValues" optionLabel="name" placeholder="เลือกระดับความรุนแรง" class="w-full" appendTo="body" [showClear]="true" />
        </div>
        <ng-template #footer>
            <p-button label="Save" (click)="close()" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService]
})
export class SpeedDial implements OnInit {
    private messageService = inject(MessageService);
    items: MenuItem[] | null = null;
    display: boolean = false;
    dropdownValue: any = null;
    selectButtonValue: any = null;
    traumaSelectButtonValue: any = null;
    cbdValue: any = null;
    severityValue: any = null;

    dropdownValues = [
        { name: 'แจ้งเหตุ', code: 'NY' },
        { name: 'แจ้งเพิ่มเติม เหตุเดียวกัน', code: 'RM' },
        { name: 'ปรึกษา', code: 'LDN' },
        { name: 'สายหลุด', code: 'IST' },
        { name: 'ก่อกวน', code: 'PRS' }
    ];

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

    close() {
        this.display = false;
    }

    ngOnInit() {
        this.items = [
            {
                label: 'บันทึกข้อมูล',
                icon: 'pi pi-pencil',
                command: () => {
                    this.display = true;
                }
            },
            {
                label: 'สลับวันเวลา',
                icon: 'pi pi-calendar-clock',
                command: () => {
                    this.messageService.add({ severity: 'error', summary: 'Delete', detail: 'Data Deleted' });
                }
            },
            {
                label: 'วันเวลาปัจจุบัน',
                icon: 'pi pi-refresh',
                command: () => {
                    this.messageService.add({ severity: 'success', summary: 'Update', detail: 'Data Updated' });
                }
            },
            {
                label: 'Upload',
                icon: 'pi pi-upload',
                routerLink: ['/fileupload']
            },
            {
                label: 'Angular.dev',
                icon: 'pi pi-external-link',
                target: '_blank',
                url: 'https://angular.dev'
            }
        ];
    }
}
