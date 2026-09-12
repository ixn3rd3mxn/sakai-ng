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
import { CenteredPanelDirective } from '../../../shared/centered-panel.directive';

// Trimmed version of dashboardclone's dispatch-action-dial: same
// SpeedDial + Buddhist-era date picker pattern, but only a date (no shift,
// since every stat table on this page already merges all three shifts).
@Component({
    standalone: true,
    selector: 'app-incident-history-date-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, FormsModule, DatePickerModule, BuddhistYearDirective, CenteredPanelDirective, AutoFocusModule],
    template: `<p-toast />
    <!-- Sized like dispatch-action-dial's dial: a 50px trigger with a 20px
         glyph, 44px actions. Trigger through [buttonStyle], not [style] -
         [style] is the root wrapper that also holds the fan, and sizing that
         squashes the button. -->
    <p-speeddial
        [model]="items"
        direction="up"
        showIcon="pi pi-bars"
        hideIcon="pi pi-times"
        [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10 }"
        [buttonStyle]="{ width: '50px', height: '50px' }"
        [tooltipOptions]="{ tooltipPosition: 'left' }"
    />

    <!-- Sized in rem, not vw: this dialog holds one date input and two
         buttons, none of which scale with the viewport. The vw breakpoints
         were inherited from dispatch-action-dial's two-column
         "สลับวันเวลา" dialog and made the width swing between 253px and
         346px depending on where the viewport fell. maxWidth is the only
         viewport-relative part, so it still fits a narrow phone. -->
    <p-dialog header="สลับวัน" [focusOnShow]="false" [(visible)]="displayDatePicker" [style]="{ width: '20rem', maxWidth: '92vw' }" [modal]="true">
        <div class="flex flex-col gap-1">
            <div class="font-semibold">เลือกวัน</div>
            <!-- centeredPanel: the popup is wider than this input, so it is
                 centred under it (on a phone, on the screen) rather than hung
                 off its left edge. See CenteredPanelDirective. -->
            <p-datepicker
                buddhistYear
                centeredPanel
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
    styles: `
        /* Same rules as dispatch-action-dial, which explains each declaration:
           the actions get no size from SpeedDial's stylesheet, so width alone
           leaves Button's padding setting the height and the circle draws as
           an ellipse. */
        :host ::ng-deep .p-speeddial-action.p-button {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border-radius: 50%;
        }

        :host ::ng-deep .p-speeddial-action .p-speeddial-action-icon,
        :host ::ng-deep .p-speeddial-action .p-button-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            line-height: 18px;
        }

        :host ::ng-deep .p-speeddial-button .p-button-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            line-height: 20px;
        }

        /* Trigger rotation on open. PrimeNG's own p-speeddial-rotate does this
           for the default + icon but switches itself off once hideIcon is set,
           so the bars/times pair gets it back here: the icon swap is instant
           and the quarter turn is what makes it read as one motion. The
           transition list is Button's own plus transform - a bare transform
           transition would drop the hover colour fades. */
        :host ::ng-deep .p-speeddial-button {
            transition:
                transform 250ms cubic-bezier(0.4, 0, 0.2, 1),
                background var(--p-button-transition-duration),
                color var(--p-button-transition-duration),
                border-color var(--p-button-transition-duration),
                box-shadow var(--p-button-transition-duration),
                outline-color var(--p-button-transition-duration);
        }

        :host ::ng-deep .p-speeddial-open .p-speeddial-button {
            transform: rotate(90deg);
        }
    `,
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
