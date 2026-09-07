import { Component, OnInit, inject } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoFocusModule } from 'primeng/autofocus';
import { IncidentHistoryDataService } from '../services/incident-history-data.service';
import { BuddhistYearDirective } from '../../../shared/buddhist-year.directive';

// Trimmed version of dashboardclone's dispatch-action-dial: same
// SpeedDial + Buddhist-era date picker pattern, but only a date (no shift,
// since every stat table on this page already merges all three shifts).
@Component({
    standalone: true,
    selector: 'app-incident-history-date-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, FormsModule, DatePickerModule, BuddhistYearDirective, AutoFocusModule],
    template: `<p-toast />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10 }" [tooltipOptions]="{ tooltipPosition: 'left' }" />

    <!-- Sized in rem, not vw: this dialog holds one date input and two
         buttons, none of which scale with the viewport. The vw breakpoints
         were inherited from dispatch-action-dial's two-column
         "สลับวันเวลา" dialog and made the width swing between 253px and
         346px depending on where the viewport fell. maxWidth is the only
         viewport-relative part, so it still fits a narrow phone. -->
    <p-dialog header="สลับวัน" [focusOnShow]="false" [(visible)]="displayDatePicker" [style]="{ width: '20rem', maxWidth: '92vw' }" [modal]="true">
        <div class="flex flex-col gap-1">
            <div class="font-semibold">เลือกวัน</div>
            <p-datepicker
                buddhistYear
                [(ngModel)]="tempSelectedDate"
                [minDate]="minDate"
                [maxDate]="maxDate"
                [readonlyInput]="true"
                dateFormat="dd/mm/yy"
                placeholder="เลือกวัน"
                class="w-full"
                appendTo="body"
            />
        </div>
        <ng-template #footer>
            <p-button label="ยกเลิก" severity="secondary" (click)="displayDatePicker = false" />
            <p-button label="ยืนยัน" (click)="confirmDate()" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService]
})
export class IncidentHistoryDateDial implements OnInit {
    private messageService = inject(MessageService);
    private dataService = inject(IncidentHistoryDataService);

    items: MenuItem[] | null = null;

    displayDatePicker: boolean = false;
    tempSelectedDate: Date | undefined;
    minDate: Date | undefined;
    maxDate: Date | undefined;

    // Buddhist-era rendering (and keeping the popup one size across its
    // day/month/year views) lives in BuddhistYearDirective - see the
    // `buddhistYear` attribute on the picker above.

    openDatePicker() {
        this.tempSelectedDate = this.dataService.selectedDate();
        this.displayDatePicker = true;
    }

    confirmDate() {
        if (this.tempSelectedDate) {
            this.dataService.select(this.tempSelectedDate);

            this.messageService.add({
                severity: 'success',
                summary: 'สลับวัน',
                detail: `เลือกวัน: ${this.tempSelectedDate.toLocaleDateString('th-TH')}`
            });
            this.displayDatePicker = false;
        } else {
            this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดเลือกวันที่' });
        }
    }

    resetDate() {
        this.dataService.selectCurrent();
        this.messageService.add({ severity: 'success', summary: 'วันปัจจุบัน', detail: 'กำลังดูข้อมูลวันนี้' });
    }

    ngOnInit() {
        this.minDate = new Date(2026, 7, 1);
        this.maxDate = new Date(2027, 12, 31);

        this.items = [
            {
                label: 'สลับวัน',
                icon: 'pi pi-calendar',
                command: () => {
                    this.openDatePicker();
                }
            },
            {
                label: 'วันปัจจุบัน',
                icon: 'pi pi-refresh',
                command: () => {
                    this.resetDate();
                }
            }
        ];
    }
}
