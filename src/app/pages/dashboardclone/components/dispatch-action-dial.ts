import { AfterViewChecked, Component, ElementRef, OnDestroy, ViewChild, inject, signal, OnInit } from '@angular/core';
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
import { CallTypeCode, IncidentCreateRequest, SHIFT_CODE_TO_LABEL, SHIFT_LABEL_TO_CODE, SelectOption, TimePeriod } from '../dispatch.types';
import { DispatchApiService } from '../services/dispatch-api.service';
import { DispatchDataService } from '../services/dispatch-data.service';
import { BUDDHIST_ERA_OFFSET, parseIsoDate, shiftDisplayedYearToBuddhist } from '../services/date-utils';

@Component({
    standalone: true,
    selector: 'app-dispatch-action-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, SelectModule, SelectButtonModule, FormsModule, ConfirmDialogModule, MessageModule, DatePickerModule],
    template: `<p-toast />
    <p-confirmdialog />
    <!-- zIndex matches incident-history-date-dial. Without it the dial sits at
    z-index:auto and only wins over the cards by being last in the DOM, which
    any positioned element with a z-index (the layout chrome uses 997-999, and
    dispatch-datetime-warning uses z-10) would silently beat wherever they
    overlap. -->
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10 }" [tooltipOptions]="{ tooltipPosition: 'left' }" />

    <p-dialog header="สลับวันเวลา" [(visible)]="displayDateTime" [breakpoints]="{ '1400px': '21vw', '1100px': '24vw', '960px': '33vw', '500px': '67vw' }" [style]="{ width: '18vw' }" [modal]="true">
        <div class="flex gap-4">
            <div class="flex flex-col gap-1"><div class="font-semibold">เลือกเวร</div><p-select [(ngModel)]="tempSelectedTime" [options]="timeOptions" optionLabel="name" placeholder="เลือกเวร" class="w-full" appendTo="body" /></div>
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
                <p-select [(ngModel)]="callType" [options]="callTypeOptions" optionLabel="name" placeholder="เลือกประเภท" appendTo="body" [showClear]="true" [invalid]="isCallTypeInvalid" />
                @if (isCallTypeInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภท</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ช่องทางการแจ้งเหตุ</div>
                <div class="w-full disabled-field">
                    <p-selectbutton [(ngModel)]="reportingChannel" [options]="reportingChannelOptions" optionLabel="name" [disabled]="isFieldsDisabled" [invalid]="isReportingChannelInvalid" />
                </div>
                @if (isReportingChannelInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกช่องทางการแจ้งเหตุ</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ประเภทของการเจ็บป่วย</div>
                <div class="w-full disabled-field">
                    <p-selectbutton [(ngModel)]="caseType" [options]="caseTypeOptions" optionLabel="name" [disabled]="isFieldsDisabled" [invalid]="isCaseTypeInvalid" />
                </div>
                @if (isCaseTypeInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภทของการเจ็บป่วย</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">CBD</div>
                <div class="w-full disabled-field">
                    <p-select [(ngModel)]="cbd" [options]="cbdOptions" optionLabel="name" placeholder="เลือก CBD" class="w-full" appendTo="body" [showClear]="true" [disabled]="isFieldsDisabled" [invalid]="isCbdInvalid" />
                </div>
                @if (isCbdInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือก CBD</p-message>
                }
            </div>
            <div class="flex flex-col gap-1">
                <div class="font-semibold" [class.text-surface-500]="isFieldsDisabled">ระดับความรุนแรง</div>
                <div class="w-full disabled-field">
                    <p-select [(ngModel)]="severity" [options]="severityOptions" optionLabel="name" placeholder="เลือกระดับความรุนแรง" class="w-full" appendTo="body" [showClear]="true" [disabled]="isFieldsDisabled" [invalid]="isSeverityInvalid" />
                </div>
                @if (isSeverityInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกระดับความรุนแรง</p-message>
                }
            </div>
        </div>
        <ng-template #footer>
            <p-button label="รีเซ็ต" severity="secondary" [disabled]="saving()" (click)="resetForm()" />
            <p-button label="บันทึก" [loading]="saving()" (click)="onSaveClick($event)" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService, ConfirmationService]
})
export class DispatchActionDial implements OnInit, AfterViewChecked, OnDestroy {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private api = inject(DispatchApiService);
    private dataService = inject(DispatchDataService);

    @ViewChild('datePicker', { read: ElementRef }) private datePickerEl?: ElementRef<HTMLElement>;

    private readonly beOffset = BUDDHIST_ERA_OFFSET;

    items: MenuItem[] | null = null;

    displayDateTime: boolean = false;
    displaySaveWarning: boolean = false;
    tempSelectedDate: Date | undefined;
    tempSelectedTime: TimePeriod | undefined;
    minDate: Date | undefined;
    maxDate: Date | undefined;

    // The datepicker component has no Buddhist-calendar support (it formats
    // years straight off Date.getFullYear()), so the visible input text is
    // overwritten here every check, and the popup's year texts - which have
    // no template hook - are patched live via MutationObserver while open.
    // The bound Date value driving selection/min/max/backend stays Gregorian throughout.
    private yearPanelObserver: MutationObserver | null = null;
    // Remembers the exact BE text last written to each patched node, so a
    // rescan triggered by an unrelated mutation (e.g. switching from date-view
    // to month-view, which leaves the header's year button untouched) can tell
    // "already patched, unchanged" apart from "genuinely new CE text" instead
    // of blindly re-shifting an already-BE value (2569 -> 3112).
    private readonly patchedYearNodes = new WeakMap<Text, string>();
    private static readonly YEAR_TEXT_SELECTOR = '.p-datepicker-select-year, .p-datepicker-year-view .p-datepicker-year';
    private static readonly DECADE_RANGE_SELECTOR = '.p-datepicker-decade';

    timeOptions: TimePeriod[] = [
        { name: 'เช้า' },
        { name: 'บ่าย' },
        { name: 'ดึก' }
    ];

    private _display: boolean = false;

    get display(): boolean {
        return this._display;
    }

    set display(value: boolean) {
        this._display = value;
        if (value) {
            this.formSubmitted = false;
        } else {

            this._callType = null;
            this.reportingChannel = null;
            this.caseType = null;
            this.cbd = null;
            this.severity = null;
            this.formSubmitted = false;
        }
    }

    private _callType: SelectOption | null = null;
    reportingChannel: SelectOption | null = null;
    caseType: SelectOption | null = null;
    cbd: SelectOption | null = null;
    severity: SelectOption | null = null;

    get callType(): SelectOption | null {
        return this._callType;
    }

    set callType(value: SelectOption | null) {
        this._callType = value;
        this.formSubmitted = false;
        if (value?.code !== 'NY') {
            this.reportingChannel = null;
            this.caseType = null;
            this.cbd = null;
            this.severity = null;
        }
    }

    callTypeOptions: SelectOption[] = [
        { name: 'แจ้งเหตุ', code: 'NY' },
        { name: 'แจ้งเพิ่มเติม เหตุเดียวกัน', code: 'RM' },
        { name: 'ปรึกษา', code: 'LDN' },
        { name: 'สายหลุด', code: 'IST' },
        { name: 'ก่อกวน', code: 'PRS' }
    ];

    get isFieldsDisabled(): boolean {
        return this.callType?.code !== 'NY';
    }

    // In flight from the moment the confirmation is accepted until the POST
    // settles. Drives `[loading]` on the save button, which PrimeNG also
    // renders as a spinner and - the part that matters - disables, so the
    // same incident cannot be submitted twice while the first is in flight.
    // A signal rather than a plain field: change detection is zoneless here,
    // so a field written from inside an rxjs callback would not repaint.
    readonly saving = signal(false);

    formSubmitted: boolean = false;

    get isCallTypeInvalid(): boolean {
        return this.formSubmitted && !this.callType;
    }

    get isReportingChannelInvalid(): boolean {
        return this.formSubmitted && this.callType?.code === 'NY' && !this.reportingChannel;
    }

    get isCaseTypeInvalid(): boolean {
        return this.formSubmitted && this.callType?.code === 'NY' && !this.caseType;
    }

    get isCbdInvalid(): boolean {
        return this.formSubmitted && this.callType?.code === 'NY' && !this.cbd;
    }

    get isSeverityInvalid(): boolean {
        return this.formSubmitted && this.callType?.code === 'NY' && !this.severity;
    }

    get isFormValid(): boolean {

        if (this.callType?.code === 'NY') {
            return !!(this.callType && this.reportingChannel && this.caseType && this.cbd && this.severity);
        }

        return !!this.callType;
    }

    reportingChannelOptions: SelectOption[] = [
        { name: '1669' },
        { name: '2nd' },
        { name: 'วิทยุ' }
    ];

    caseTypeOptions: SelectOption[] = [
        { name: 'trauma' },
        { name: 'non-trauma' }
    ];

    cbdOptions: SelectOption[] = [
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

    severityOptions: SelectOption[] = [
        { name: 'ระดับที่ 1 สีแดง ฉุกเฉินวิกฤติ' },
        { name: 'ระดับที่ 2 สีเหลือง ฉุกเฉินเร่งด่วน' },
        { name: 'ระดับที่ 3 สีเขียว ฉุกเฉินไม่เร่งด่วน' },
        { name: 'ระดับที่ 4 สีขาว เจ็บป่วยไม่ฉุกเฉิน' },
        { name: 'ระดับที่ 5 สีดำ ไม่มีการตอบสนอง / ไม่พบผู้ป่วยฉุกเฉิน' }
    ];

    onSaveClick(event: Event) {
        // The speed dial can reopen this dialog independently of the button's
        // disabled state, so re-entry is guarded here too.
        if (this.saving()) {
            return;
        }

        this.formSubmitted = true;

        if (!this.isFormValid) {
            this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดกรอกข้อมูลให้ครบทุกช่อง' });
            return;
        }

        this.confirmSave(event);
    }

    getConfirmationMessage(): string {
        const parts: string[] = [];

        if (this.callType) {
            parts.push(`<b>ประเภท:</b><br>${this.callType.name}`);
        }

        if (this.callType?.code === 'NY') {
            if (this.reportingChannel) {
                parts.push(`<b>ช่องทางการแจ้งเหตุ:</b><br>${this.reportingChannel.name}`);
            }
            if (this.caseType) {
                parts.push(`<b>ประเภทของการเจ็บป่วย:</b><br>${this.caseType.name}`);
            }
            if (this.cbd) {
                parts.push(`<b>CBD:</b><br>${this.cbd.name}`);
            }
            if (this.severity) {
                parts.push(`<b>ระดับความรุนแรง:</b><br>${this.severity.name}`);
            }
        }

        return `<div style="line-height:1.8">คุณต้องการบันทึกข้อมูลต่อไปนี้หรือไม่?<br><br>${parts.join('<br><br>')}</div>`;
    }

    private buildIncidentPayload(): IncidentCreateRequest | null {
        const code = this.callType?.code as CallTypeCode | undefined;
        if (!code) return null;

        if (code !== 'NY') {
            return { call_type_code: code };
        }

        return {
            call_type_code: code,
            reporting_channel_name: this.reportingChannel?.name,
            case_type_name: this.caseType?.name,
            cbd_name: this.cbd?.name,
            severity_name: this.severity?.name
        };
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
                const payload = this.buildIncidentPayload();
                if (!payload) {
                    this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดเลือกประเภท' });
                    return;
                }

                this.saving.set(true);

                this.dataService.createIncident(payload).subscribe({
                    next: () => {
                        this.saving.set(false);
                        this.messageService.add({ severity: 'success', summary: 'บันทึกสำเร็จ', detail: 'ข้อมูลได้ถูกบันทึกแล้ว' });
                        this.display = false;
                        this.formSubmitted = false;
                    },
                    error: () => {
                        // Left open with the entry intact so it can be retried -
                        // the `display` setter clears the form, so closing here
                        // would lose what the dispatcher typed.
                        this.saving.set(false);
                        this.messageService.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' });
                    }
                });
            },
            reject: () => {
                this.messageService.add({ severity: 'warn', summary: 'ยกเลิก', detail: 'การบันทึกถูกยกเลิก' });
            }
        });
    }

    resetForm() {
        this._callType = null;
        this.reportingChannel = null;
        this.caseType = null;
        this.cbd = null;
        this.severity = null;
        this.formSubmitted = false;
    }

    openSaveDialog() {
        if (this.dataService.isCurrent()) {
            this.display = true;
        } else {
            this.displaySaveWarning = true;
        }
    }

    resetAndOpenSaveDialog() {
        this.dataService.selectCurrent();

        this.displaySaveWarning = false;
        this.display = true;
    }

    openDateTimeDialog() {
        this.tempSelectedDate = this.dataService.selectedDate();
        this.tempSelectedTime = { name: SHIFT_CODE_TO_LABEL[this.dataService.selectedShift()] };
        this.displayDateTime = true;
    }

    resetDateTime() {
        // The "current" date/shift is resolved server-side, same source of
        // truth as everything else - never computed here.
        this.api.getContext().subscribe((ctx) => {
            this.tempSelectedDate = parseIsoDate(ctx.operational_day);
            this.tempSelectedTime = { name: SHIFT_CODE_TO_LABEL[ctx.shift] };
        });
    }

    confirmDateTime() {
        if (this.tempSelectedDate && this.tempSelectedTime) {
            const shiftCode = SHIFT_LABEL_TO_CODE[this.tempSelectedTime.name];
            this.dataService.select(this.tempSelectedDate, shiftCode);

            this.messageService.add({
                severity: 'success',
                summary: 'สลับวันเวลา',
                detail: `เลือกวัน: ${this.tempSelectedDate.toLocaleDateString('th-TH')} เวลา: ${this.tempSelectedTime.name}`
            });
            this.displayDateTime = false;
        } else {
            this.messageService.add({
                severity: 'error',
                summary: 'ข้อมูลไม่สมบูรณ์',
                detail: 'โปรดเลือกวันที่และเวลา'
            });
        }
    }

    ngAfterViewChecked(): void {
        this.ensureInputValuePatched();
    }

    ngOnDestroy(): void {
        this.yearPanelObserver?.disconnect();
    }

    // Zoneless change detection means there's no reliable "after PrimeNG wrote
    // the CE text" moment to hook via lifecycle callbacks - PrimeNG can rewrite
    // input.value (e.g. on focus) between our checks with nothing to re-trigger
    // ours. Overriding the value property on this one <input> intercepts every
    // write at the source instead, so it's correct regardless of CD timing.
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

        panel.querySelectorAll<HTMLElement>(DispatchActionDial.YEAR_TEXT_SELECTOR).forEach((node) => {
            const textNode = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
            const raw = textNode?.textContent?.trim();
            if (!textNode || !raw || !/^\d{4}$/.test(raw) || this.patchedYearNodes.get(textNode) === raw) return;

            const shifted = String(Number(raw) + this.beOffset);
            textNode.textContent = shifted;
            this.patchedYearNodes.set(textNode, shifted);
        });

        // Decade header, e.g. "2020 - 2029" - shift both years in place.
        panel.querySelectorAll<HTMLElement>(DispatchActionDial.DECADE_RANGE_SELECTOR).forEach((node) => {
            const textNode = Array.from(node.childNodes).find((n) => n.nodeType === Node.TEXT_NODE) as Text | undefined;
            const raw = textNode?.textContent;
            if (!textNode || !raw || !/^\s*\d{4}\s*-\s*\d{4}\s*$/.test(raw) || this.patchedYearNodes.get(textNode) === raw) return;

            const shifted = raw.replace(/\d{4}/g, (year) => String(Number(year) + this.beOffset));
            textNode.textContent = shifted;
            this.patchedYearNodes.set(textNode, shifted);
        });

        this.yearPanelObserver?.observe(panel, { childList: true, characterData: true, subtree: true });
    }

    setupDateBoundaries() {
        this.minDate = new Date(2026, 7, 1);
        this.maxDate = new Date(2027, 12, 31);
    }

    ngOnInit() {
        this.setupDateBoundaries();

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
                    this.dataService.selectCurrent();

                    this.messageService.add({ severity: 'success', summary: 'รีเซ็ตเป็นปัจจุบัน', detail: 'กำลังดูข้อมูลปัจจุบัน' });
                }
            }
        ];
    }
}
