import { Component, inject, signal, OnInit } from '@angular/core';
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
import { TooltipModule } from 'primeng/tooltip';
import { CallTypeCode, IncidentCreateRequest, SHIFT_CODE_TO_LABEL, SHIFT_LABEL_TO_CODE, SelectOption, TimePeriod } from '../dispatch.types';
import { DispatchApiService } from '../services/dispatch-api.service';
import { DispatchDataService } from '../services/dispatch-data.service';
import { formatDateParam, parseIsoDate } from '../services/date-utils';
import { BuddhistYearDirective } from '../../../shared/buddhist-year.directive';

@Component({
    standalone: true,
    selector: 'app-dispatch-action-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, SelectModule, SelectButtonModule, FormsModule, ConfirmDialogModule, MessageModule, DatePickerModule, TooltipModule, BuddhistYearDirective],
    template: `<p-toast />
    <p-confirmdialog />
    <!-- Two controls, not one three-item menu. Saving is what this page is for
    and it was buried a tap deep behind a fan shared with two settings actions;
    the two that change which day you are looking at are occasional, so they
    keep the menu and saving gets its own button.

    Stacked rather than side by side: the bottom-right row already holds the
    scroll-to-top button, so a third control in that row would crowd it. Save
    takes the bottom slot as the one people reach for.

    All three are 50px. Save sits in the corner; the menu dial is offset above
    it and scroll-to-top the same distance to its left, so the save button has
    clear space on both sides. The dashboard's .p-scrolltop rule holds the
    matching offset - the two are a pair, and grow the buttons enough and both
    have to move together.

    zIndex matches incident-history-date-dial. Without it these sit at
    z-index:auto and only win over the cards by being last in the DOM, which
    any positioned element with a z-index (the layout chrome uses 997-999)
    would silently beat wherever they overlap. -->
    <p-speeddial
        [model]="menuItems"
        direction="up"
        showIcon="pi pi-bars"
        hideIcon="pi pi-times"
        [style]="{ position: 'fixed', right: '1rem', bottom: '5rem', zIndex: 10 }"
        [buttonStyle]="{ width: '50px', height: '50px' }"
        [tooltipOptions]="{ tooltipPosition: 'left' }"
    />

    <!-- A button, not a one-item speed dial: there is no menu to open, so the
    fan animation would be a frame of delay in front of the only thing it can
    do. 50px to match the dial trigger above it. -->
    <p-button
        icon="pi pi-pencil"
        styleClass="save-fab"
        [rounded]="true"
        [raised]="true"
        pTooltip=""
        tooltipPosition="left"
        ariaLabel="บันทึกข้อมูล"
        [style]="{ position: 'fixed', right: '1rem', bottom: '1rem', zIndex: 10, width: '50px', height: '50px' }"
        (onClick)="openSaveDialog()"
    />

    <p-dialog header="สลับวันเวลา" [(visible)]="displayDateTime" [breakpoints]="{ '1400px': '21vw', '1100px': '24vw', '960px': '33vw', '500px': '67vw' }" [style]="{ width: '18vw' }" [modal]="true">
        <div class="flex gap-4">
            <div class="flex flex-col gap-1"><div class="font-semibold">เลือกเวร</div><p-select [(ngModel)]="tempSelectedTime" [options]="timeOptions" optionLabel="name" placeholder="เลือกเวร" class="w-full" appendTo="body" /></div>
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
                <!-- Buttons, not a dropdown. Five options that never change,
                     picked on every single save: a dropdown costs a tap to open
                     and a tap to choose, and hides the list until you ask. Laid
                     out wrapping (see .call-type-select) because the labels are
                     too long to sit in one row at this dialog width.

                     .select-row is the layout the three button groups in this
                     dialog share: full width, split evenly. -->
                <div class="select-row call-type-select">
                    <p-selectbutton [(ngModel)]="callType" [options]="callTypeOptions" optionLabel="name" [invalid]="isCallTypeInvalid" [allowEmpty]="false" />
                </div>
                @if (isCallTypeInvalid) {
                    <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภท</p-message>
                }
            </div>
            <!-- Only แจ้งเหตุ carries these four. Every other type submits the
                 type alone, so on those the fields are not just inapplicable -
                 there is nothing they could be filled in with. They used to
                 render greyed out on every save, which asked the dispatcher to
                 read and dismiss four fields that were never going to apply.

                 Hidden, not disabled: disabled says "not right now", and
                 invites a look for what would enable it. Here the answer is the
                 field above, which is the one thing already on screen.

                 The callType setter clears all four whenever the type moves off
                 แจ้งเหตุ, so nothing filled in here survives a change of mind
                 and reappears in the payload. -->
            @if (isIncidentReport) {
                <div class="flex flex-col gap-1">
                    <div class="font-semibold">ช่องทางการแจ้งเหตุ</div>
                    <div class="w-full select-row">
                        <p-selectbutton [(ngModel)]="reportingChannel" [options]="reportingChannelOptions" optionLabel="name" [invalid]="isReportingChannelInvalid" />
                    </div>
                    @if (isReportingChannelInvalid) {
                        <p-message severity="error" size="small" variant="simple">โปรดเลือกช่องทางการแจ้งเหตุ</p-message>
                    }
                </div>
                <div class="flex flex-col gap-1">
                    <div class="font-semibold">ประเภทของการเจ็บป่วย</div>
                    <div class="w-full select-row">
                        <p-selectbutton [(ngModel)]="caseType" [options]="caseTypeOptions" optionLabel="name" [invalid]="isCaseTypeInvalid" />
                    </div>
                    @if (isCaseTypeInvalid) {
                        <p-message severity="error" size="small" variant="simple">โปรดเลือกประเภทของการเจ็บป่วย</p-message>
                    }
                </div>
                <div class="flex flex-col gap-1">
                    <div class="font-semibold">CBD</div>
                    <div class="w-full">
                        <p-select [(ngModel)]="cbd" [options]="cbdOptions" optionLabel="name" placeholder="เลือก CBD" class="w-full" appendTo="body" [showClear]="true" [invalid]="isCbdInvalid" />
                    </div>
                    @if (isCbdInvalid) {
                        <p-message severity="error" size="small" variant="simple">โปรดเลือก CBD</p-message>
                    }
                </div>
                <div class="flex flex-col gap-1">
                    <div class="font-semibold">ระดับความรุนแรง</div>
                    <div class="w-full">
                        <p-select [(ngModel)]="severity" [options]="severityOptions" optionLabel="name" placeholder="เลือกระดับความรุนแรง" class="w-full" appendTo="body" [showClear]="true" [invalid]="isSeverityInvalid" />
                    </div>
                    @if (isSeverityInvalid) {
                        <p-message severity="error" size="small" variant="simple">โปรดเลือกระดับความรุนแรง</p-message>
                    }
                </div>
            }
        </div>
        <ng-template #footer>
            <p-button label="รีเซ็ต" severity="secondary" [disabled]="saving()" (click)="resetForm()" />
            <p-button label="บันทึก" [loading]="saving()" (click)="onSaveClick($event)" />
        </ng-template>
    </p-dialog>`,
    styles: `
        /* The three controls in this corner - save, the menu dial, and the
           dashboard's scroll-to-top - are all 50px so the column reads as one
           set. The dial's trigger is sized by its [buttonStyle] input rather
           than from here: SpeedDial's [style] lands on the root wrapper that
           holds the trigger *and* the fan of items, so sizing through it boxes
           in the whole component and squashes the button (50 x 18, padding
           collapsed to 8px 0). [buttonStyle] is the input that reaches the
           button itself.

           The two menu entries that fan out are sized below. */

        /* 44px: bigger than the default, still under the trigger's 50px so the
           fan stays visibly subordinate to the button that opened it. 44 is
           also the usual floor for a touch target, which these had been under.

           A rule rather than an input - SpeedDial's only style inputs are for
           the root and the trigger, so the action buttons have to be reached
           through their class.

           More declarations than look necessary, and each earns its place.
           SpeedDial's own stylesheet sets no size for these at all: they are
           small icon-only p-buttons, so their box comes from Button's padding
           plus the icon. Setting width alone left the height at 6 + 20 + 6 =
           32px, and a 50% radius on a 44 x 32 box draws an ellipse. padding: 0
           takes the height out of Button's hands, min-* holds the floor against
           anything that sets height later, and .p-button raises this above the
           tie with Button's own single-class rules. */
        :host ::ng-deep .p-speeddial-action.p-button {
            width: 44px;
            height: 44px;
            min-width: 44px;
            min-height: 44px;
            padding: 0;
            border-radius: 50%;
        }

        /* Both class names: PrimeNG puts p-speeddial-action-icon on the glyph,
           and Button's own p-button-icon is on it too. */
        :host ::ng-deep .p-speeddial-action .p-speeddial-action-icon,
        :host ::ng-deep .p-speeddial-action .p-button-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            line-height: 18px;
        }

        /* Icons do not scale with their button, so a default 1rem glyph sits
           lost in the middle of a 50px circle. 20px on both of these and on the
           scroll-to-top, so all three read at the same weight.

           width/height as well as font-size: the glyph is sized by font-size,
           but the box around it is not, and an inline box of some other size is
           what knocks an icon off-centre in a round button. */
        :host ::ng-deep .p-speeddial-button .p-button-icon,
        :host ::ng-deep .save-fab .p-button-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            line-height: 20px;
        }

        /* Shared by all three button groups in this dialog. PrimeNG lays a
           SelectButton out as a nowrap flex row sized to its content, with the
           inner radii stripped to fake one segmented control. These groups
           instead span the dialog and split it evenly, so a row of options
           always fills the same width as the field above it - which also means
           they can wrap, and a wrapped segmented control looks broken, so the
           radius goes back on each button.

           flex: 1 1 0 gives every option an equal share: thirds for the three
           channels, halves for the two case types. The call-type group
           overrides these bases below, because it is the one group that has to
           wrap onto two rows. */
        .select-row ::ng-deep .p-selectbutton {
            display: flex;
            flex-wrap: wrap;
            gap: 0.25rem;
        }

        .select-row ::ng-deep .p-togglebutton {
            flex: 1 1 0;
            border-radius: var(--p-content-border-radius);

            /* Flex items default to min-width: auto, which refuses to shrink
               below the widest unbreakable run of the label - enough for
               "แจ้งเพิ่มเติม เหตุเดียวกัน" to push past its share and force a
               wrap, taking the row layout with it. The text should wrap inside
               the button instead. */
            min-width: 0;
        }

        /* Two rows, fixed rather than wherever the labels happen to break:
           แจ้งเหตุ and แจ้งเพิ่มเติม เหตุเดียวกัน take the top row 1:2, and the
           three short ones - ปรึกษา, สายหลุด, ก่อกวน - share the row below at a
           third each. Left to wrap on its own the group splits on label width,
           which put ปรึกษา on the wrong line and moved around with the dialog's
           breakpoints.

           Each basis subtracts its share of the 0.25rem gap so a row fills
           exactly: 33.333 + 66.667 - 2 x 0.125 + 0.25 = 100%, and
           3 x (33.333% - 0.167) + 0.5 = 100%.

           The bases have to be real percentages rather than the shared
           flex: 1 1 0 above: wrapping is decided on base sizes before any
           growing, so at a zero basis all five would fit on one line and the
           two rows would collapse.

           This ties the layout to the order of callTypeOptions - the first two
           entries are the top row, the rest the bottom. Reordering that array
           reflows these rows. */
        .call-type-select ::ng-deep .p-togglebutton:nth-child(1) {
            flex: 1 1 calc(33.333% - 0.125rem);
        }

        .call-type-select ::ng-deep .p-togglebutton:nth-child(2) {
            flex: 1 1 calc(66.667% - 0.125rem);
        }

        .call-type-select ::ng-deep .p-togglebutton:nth-child(n + 3) {
            flex: 1 1 calc(33.333% - 0.167rem);
        }
    `,
    providers: [MessageService, ConfirmationService]
})
export class DispatchActionDial implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private api = inject(DispatchApiService);
    private dataService = inject(DispatchDataService);

    menuItems: MenuItem[] | null = null;

    displayDateTime: boolean = false;
    displaySaveWarning: boolean = false;
    tempSelectedDate: Date | undefined;
    tempSelectedTime: TimePeriod | undefined;
    minDate: Date | undefined;
    maxDate: Date | undefined;

    // Buddhist-era rendering (and keeping the popup one size across its
    // day/month/year views) lives in BuddhistYearDirective - see the
    // `buddhistYear` attribute on the picker above.

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

    // 'NY' (แจ้งเหตุ) is the only type that carries the four clinical fields;
    // every other one submits as `{ call_type_code }` alone. This gates whether
    // they are on screen at all - see the template, and buildIncidentPayload,
    // which draws the same line for what gets sent.
    get isIncidentReport(): boolean {
        return this.callType?.code === 'NY';
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
        // The save button can reopen this dialog independently of the submit
        // button's disabled state, so re-entry is guarded here too.
        if (this.saving()) {
            return;
        }

        this.formSubmitted = true;

        if (!this.isFormValid) {
            this.messageService.add({ severity: 'error', summary: 'ข้อมูลไม่สมบูรณ์', detail: 'โปรดกรอกข้อมูลให้ครบทุกช่อง' });
            return;
        }

        // Only แจ้งเหตุ is confirmed. The other four submit one field - the type
        // itself - which the dispatcher has just tapped and can see selected on
        // screen; picking it and then pressing บันทึก is already two deliberate
        // acts, and a dialog that reads the single value back is a third. That
        // was most of what "too many steps" was describing.
        //
        // แจ้งเหตุ keeps it: five clinical fields, and the API is insert-only -
        // there is no delete endpoint, so nothing here can be undone once it is
        // written. That is the argument for a last look at the long form, and
        // equally the argument against spending one on a single word.
        if (this.callType?.code === 'NY') {
            this.confirmSave(event);
        } else {
            this.submitIncident();
        }
    }

    /** The POST itself, shared by the confirmed and unconfirmed paths. */
    private submitIncident() {
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
                // Left open with the entry intact so it can be retried - the
                // `display` setter clears the form, so closing here would lose
                // what the dispatcher typed.
                this.saving.set(false);
                this.messageService.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง' });
            }
        });
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

            accept: () => this.submitIncident(),
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
            const chosenDate = this.tempSelectedDate;
            const shiftCode = SHIFT_LABEL_TO_CODE[this.tempSelectedTime.name];

            // Choosing the day and shift that are current *right now* means
            // "follow the board", not "pin me to these values". Pinning them
            // looks identical until the clock crosses a shift boundary, at
            // which point the selection stops following it: at 16:30 the board
            // sits on the finished morning shift, flips to is_current:false,
            // and waits for someone to notice the warning. The dialog opens
            // pre-filled with the current day and shift, so confirming without
            // changing anything used to be enough to freeze a live board.
            //
            // Which day and shift are current is resolved server-side, same
            // source of truth as resetDateTime above - never computed here.
            this.api.getContext().subscribe({
                next: (ctx) => {
                    if (formatDateParam(chosenDate) === ctx.operational_day && shiftCode === ctx.shift) {
                        this.dataService.selectCurrent();
                    } else {
                        this.dataService.select(chosenDate, shiftCode);
                    }
                },
                // Pin it, which is what this always did. The board then shows
                // the historical warning if the guess was wrong, rather than
                // silently claiming to be live.
                error: () => this.dataService.select(chosenDate, shiftCode)
            });

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

    setupDateBoundaries() {
        this.minDate = new Date(2026, 7, 1);
        this.maxDate = new Date(2027, 12, 31);
    }

    ngOnInit() {
        this.setupDateBoundaries();

        // บันทึกข้อมูล has moved out to its own button - see the template.
        // What is left is the pair that changes which day the board shows.
        this.menuItems = [
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
