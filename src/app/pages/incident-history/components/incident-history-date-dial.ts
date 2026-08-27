import { AfterViewChecked, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { DatePickerModule } from 'primeng/datepicker';
import { IncidentHistoryDataService } from '../services/incident-history-data.service';
import { BUDDHIST_ERA_OFFSET, shiftDisplayedYearToBuddhist } from '../../dashboardclone/services/date-utils';

// Trimmed version of dashboardclone's dispatch-action-dial: same
// SpeedDial + Buddhist-era date picker pattern, but only a date (no shift,
// since every stat table on this page already merges all three shifts).
@Component({
    standalone: true,
    selector: 'app-incident-history-date-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, FormsModule, DatePickerModule],
    template: `<p-toast />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10 }" [tooltipOptions]="{ tooltipPosition: 'left' }" />

    <p-dialog header="สลับวัน" [(visible)]="displayDatePicker" [breakpoints]="{ '960px': '75vw' }" [style]="{ width: '30vw' }" [modal]="true">
        <div class="flex flex-col gap-1">
            <div class="font-semibold">เลือกวัน</div>
            <p-datepicker
                #datePicker
                [(ngModel)]="tempSelectedDate"
                [minDate]="minDate"
                [maxDate]="maxDate"
                [readonlyInput]="true"
                dateFormat="dd/mm/yy"
                placeholder="เลือกวัน"
                class="w-full"
                appendTo="body"
                (onShow)="onDatePanelShow($event)"
                (onClose)="onDatePanelClose()"
            />
        </div>
        <ng-template #footer>
            <p-button label="ยกเลิก" severity="secondary" (click)="displayDatePicker = false" />
            <p-button label="ยืนยัน" (click)="confirmDate()" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService]
})
export class IncidentHistoryDateDial implements OnInit, AfterViewChecked, OnDestroy {
    private messageService = inject(MessageService);
    private dataService = inject(IncidentHistoryDataService);

    @ViewChild('datePicker', { read: ElementRef }) private datePickerEl?: ElementRef<HTMLElement>;

    private readonly beOffset = BUDDHIST_ERA_OFFSET;

    items: MenuItem[] | null = null;

    displayDatePicker: boolean = false;
    tempSelectedDate: Date | undefined;
    minDate: Date | undefined;
    maxDate: Date | undefined;

    // See dispatch-action-dial.ts for why the input value is patched at the
    // property-setter level rather than via a lifecycle hook: PrimeNG can
    // rewrite it (e.g. on focus) between change-detection checks, and this
    // is the one interception point that's correct regardless of timing.
    private yearPanelObserver: MutationObserver | null = null;
    private readonly patchedYearNodes = new WeakMap<Text, string>();
    private static readonly YEAR_TEXT_SELECTOR = '.p-datepicker-select-year, .p-datepicker-year-view .p-datepicker-year';
    private static readonly DECADE_RANGE_SELECTOR = '.p-datepicker-decade';

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

    ngAfterViewChecked(): void {
        this.ensureInputValuePatched();
    }

    ngOnDestroy(): void {
        this.yearPanelObserver?.disconnect();
    }

    private ensureInputValuePatched(): void {
        const input = this.datePickerEl?.nativeElement.querySelector('input');
        if (!input || (input as any).__beValuePatched) return;
        (input as any).__beValuePatched = true;

        const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(input, 'value', {
            configurable: true,
            enumerable: true,
            get(): string {
                return native.get!.call(input);
            },
            set(raw: string): void {
                native.set!.call(input, shiftDisplayedYearToBuddhist(raw));
            }
        });

        input.value = native.get!.call(input);
    }

    onDatePanelShow(panel: HTMLElement): void {
        this.yearPanelObserver = new MutationObserver(() => this.patchPanelYears(panel));
        this.patchPanelYears(panel);
    }

    onDatePanelClose(): void {
        this.yearPanelObserver?.disconnect();
        this.yearPanelObserver = null;
    }

    private patchPanelYears(panel: HTMLElement): void {
        this.yearPanelObserver?.disconnect();

        panel.querySelectorAll<HTMLElement>(IncidentHistoryDateDial.YEAR_TEXT_SELECTOR).forEach((node) => {
            const textNode = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
            const raw = textNode?.textContent?.trim();
            if (!textNode || !raw || !/^\d{4}$/.test(raw) || this.patchedYearNodes.get(textNode) === raw) return;

            const shifted = String(Number(raw) + this.beOffset);
            textNode.textContent = shifted;
            this.patchedYearNodes.set(textNode, shifted);
        });

        panel.querySelectorAll<HTMLElement>(IncidentHistoryDateDial.DECADE_RANGE_SELECTOR).forEach((node) => {
            const textNode = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
            const raw = textNode?.textContent;
            if (!textNode || !raw || !/^\s*\d{4}\s*-\s*\d{4}\s*$/.test(raw) || this.patchedYearNodes.get(textNode) === raw) return;

            const shifted = raw.replace(/\d{4}/g, (year) => String(Number(year) + this.beOffset));
            textNode.textContent = shifted;
            this.patchedYearNodes.set(textNode, shifted);
        });

        this.yearPanelObserver?.observe(panel, { childList: true, characterData: true, subtree: true });
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
