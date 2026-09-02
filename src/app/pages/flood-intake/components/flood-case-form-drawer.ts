import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DrawerModule } from 'primeng/drawer';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { formatDateParam } from '../../dashboardclone/services/date-utils';
import { FloodCase, FloodCaseInput, FloodDuplicate, FloodShift } from '../flood-intake.types';
import { FloodApiService } from '../services/flood-api.service';
import { FloodDataService } from '../services/flood-data.service';
import { FloodDraftService } from '../services/flood-draft.service';
import { FloodDuplicateWarning } from './flood-duplicate-warning';

interface FormModel {
    reported_date: Date | null;
    reported_time: Date | null;
    shift: FloodShift | null;
    agent_name: string | null;
    channel: string | null;
    reporter: string;
    phone: string;
    district_code: string | null;
    subdistrict_code: string | null;
    location_note: string;
    gender: string | null;
    age: number | null;
    chief_complaint: string;
    ddpm_coordination: string;
    operating_unit: string;
    status: string;
    assistance: string;
    remarks: string;
}

function emptyForm(): FormModel {
    return {
        reported_date: new Date(),
        reported_time: new Date(),
        shift: null,
        agent_name: null,
        channel: null,
        reporter: '',
        phone: '',
        district_code: null,
        subdistrict_code: null,
        location_note: '',
        gender: null,
        age: null,
        chief_complaint: '',
        ddpm_coordination: '',
        operating_unit: '',
        status: 'pending',
        assistance: '',
        remarks: ''
    };
}

const AUTOSAVE_INTERVAL_MS = 12_000;
const DUPLICATE_DEBOUNCE_MS = 500;

@Component({
    selector: 'app-flood-case-form-drawer',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        DrawerModule,
        ButtonModule,
        InputTextModule,
        InputNumberModule,
        TextareaModule,
        SelectModule,
        DatePickerModule,
        AutoCompleteModule,
        ConfirmDialogModule,
        FloodDuplicateWarning
    ],
    styles: [
        `
            /* 760px, not PrimeNG's ~400px default. At the default the form
               collapses to one column and eighteen rows, which is far too much
               scrolling to do while somebody is on the phone. Below 1280px it
               goes full width - the table behind it is no longer useful to
               glance at anyway. */
            :host ::ng-deep .flood-drawer {
                width: 760px;
            }
            @media (max-width: 1279px) {
                :host ::ng-deep .flood-drawer {
                    width: 100vw;
                }
            }

            .form-card {
                border: 1px solid var(--surface-border);
                border-radius: 8px;
                padding: 1rem;
                margin-bottom: 1rem;
            }
            .form-card-title {
                font-weight: 600;
                font-size: 0.95rem;
                margin-bottom: 0.85rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .field-label {
                display: block;
                font-size: 0.8rem;
                color: var(--text-color-secondary);
                margin-bottom: 0.3rem;
            }
            .required::after {
                content: ' *';
                color: var(--red-500, #ef4444);
            }
            /* Always reachable without scrolling to the end of a long form. */
            .action-bar {
                position: sticky;
                bottom: 0;
                background: var(--surface-overlay, var(--surface-card));
                border-top: 1px solid var(--surface-border);
                padding: 0.85rem 0;
                margin-top: 0.5rem;
            }
        `
    ],
    template: `
        <p-confirmdialog />

        <p-drawer
            [visible]="open()"
            position="right"
            styleClass="flood-drawer"
            [modal]="true"
            [closable]="false"
            [dismissible]="false"
            [closeOnEscape]="false"
            (onShow)="onShown()"
        >
            <ng-template #header>
                <div class="flex items-center justify-between w-full gap-3">
                    <div>
                        <div class="font-semibold text-lg">
                            {{ isNew() ? 'รับแจ้งใหม่' : 'แก้ไขเคส' }}
                        </div>
                        @if (!isNew() && loaded()) {
                            <div class="text-xs text-surface-500">
                                {{ loaded()!.time }} น. ต.{{ loaded()!.subdistrict_name }}
                            </div>
                        }
                    </div>
                    <button
                        pButton
                        type="button"
                        icon="pi pi-times"
                        class="p-button-text p-button-rounded"
                        (click)="requestClose()"
                    ></button>
                </div>
            </ng-template>

            @if (restoredDraft()) {
                <div class="rounded bg-blue-50 dark:bg-blue-900/30 px-3 py-2 mb-4 text-sm flex items-center gap-2">
                    <i class="pi pi-history"></i>
                    <span class="grow">กู้คืนร่างที่บันทึกไว้อัตโนมัติแล้ว</span>
                    <button pButton type="button" label="เริ่มใหม่" class="p-button-sm p-button-text" (click)="discardDraft()"></button>
                </div>
            }

            <app-flood-duplicate-warning
                [matches]="duplicates()"
                [windowHours]="duplicateWindow()"
                (open)="openDuplicate($event)"
            />

            <!-- Card 1 - the call itself -->
            <div class="form-card">
                <div class="form-card-title"><i class="pi pi-phone"></i> ข้อมูลการรับแจ้ง</div>
                <div class="grid grid-cols-12 gap-3">
                    <div class="col-span-12 md:col-span-4">
                        <label class="field-label">วันที่</label>
                        <p-datepicker
                            [(ngModel)]="form.reported_date"
                            (ngModelChange)="onChanged()"
                            dateFormat="dd/mm/yy"
                            [showIcon]="true"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-12 md:col-span-4">
                        <label class="field-label">เวลารับแจ้ง</label>
                        <p-datepicker
                            [(ngModel)]="form.reported_time"
                            (ngModelChange)="onChanged()"
                            [timeOnly]="true"
                            hourFormat="24"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-12 md:col-span-4">
                        <label class="field-label">เวร</label>
                        <p-select
                            [(ngModel)]="form.shift"
                            (ngModelChange)="onChanged()"
                            [options]="dataService.shifts()"
                            optionLabel="label"
                            optionValue="code"
                            placeholder="ตามเวลารับแจ้ง"
                            [showClear]="true"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>

                    <div class="col-span-12 md:col-span-6">
                        <label class="field-label">เจ้าหน้าที่รับแจ้ง</label>
                        <p-select
                            [(ngModel)]="form.agent_name"
                            (ngModelChange)="onChanged()"
                            [options]="dataService.agents()"
                            optionLabel="agent_name"
                            optionValue="agent_name"
                            placeholder="เลือกเจ้าหน้าที่"
                            [showClear]="true"
                            [filter]="true"
                            filterBy="agent_name"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-12 md:col-span-6">
                        <label class="field-label">ช่องทาง</label>
                        <p-select
                            [(ngModel)]="form.channel"
                            (ngModelChange)="onChanged()"
                            [options]="dataService.channels()"
                            optionLabel="label"
                            optionValue="code"
                            placeholder="เลือกช่องทาง"
                            [showClear]="true"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                </div>
            </div>

            <!-- Card 2 - who is calling -->
            <div class="form-card">
                <div class="form-card-title"><i class="pi pi-user"></i> ผู้แจ้ง</div>
                <div class="grid grid-cols-12 gap-3">
                    <div class="col-span-12 md:col-span-7">
                        <label class="field-label">ผู้แจ้ง</label>
                        <input
                            #reporterInput
                            pInputText
                            class="w-full"
                            [(ngModel)]="form.reporter"
                            (ngModelChange)="onChanged()"
                            placeholder="เช่น ญาติ, จนท."
                        />
                        <!-- Shortcuts, not a closed list: the real column holds
                             a relationship and its tail is unpredictable.

                             tabindex="-1" deliberately. These are a saving for
                             the mouse; a keyboard user simply types the word.
                             Leaving them in the tab sequence put five stops
                             between "ผู้แจ้ง" and the phone number, which is
                             five presses per call on the one path that has to
                             be fastest. -->
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            @for (shortcut of dataService.reporterShortcuts(); track shortcut) {
                                <button
                                    pButton
                                    type="button"
                                    tabindex="-1"
                                    [label]="shortcut"
                                    class="p-button-sm p-button-outlined py-0.5 px-2"
                                    (click)="setReporter(shortcut)"
                                ></button>
                            }
                        </div>
                    </div>
                    <div class="col-span-12 md:col-span-5">
                        <label class="field-label">เบอร์โทรศัพท์</label>
                        <input
                            pInputText
                            class="w-full"
                            [(ngModel)]="form.phone"
                            (ngModelChange)="onPhoneChanged()"
                            placeholder="083-1869048 หรือ 0831869048"
                            inputmode="tel"
                        />
                    </div>
                </div>
            </div>

            <!-- Card 3 - where -->
            <div class="form-card">
                <div class="form-card-title"><i class="pi pi-map-marker"></i> สถานที่เกิดเหตุ</div>
                <div class="grid grid-cols-12 gap-3">
                    <div class="col-span-12 md:col-span-6">
                        <label class="field-label required">อำเภอ</label>
                        <p-select
                            [(ngModel)]="form.district_code"
                            (ngModelChange)="onDistrictChanged($event)"
                            [options]="dataService.districtOptions()"
                            optionLabel="label"
                            optionValue="value"
                            placeholder="เลือกอำเภอ"
                            [filter]="true"
                            filterBy="label"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-12 md:col-span-6">
                        <label class="field-label required">ตำบล</label>
                        <!-- Narrowed by the chosen amphoe, and disabled until
                             one is chosen, so a tambon from the wrong amphoe
                             cannot be picked in the first place. The server
                             rejects the pair anyway. -->
                        <p-select
                            [(ngModel)]="form.subdistrict_code"
                            (ngModelChange)="onChanged()"
                            [options]="subdistrictOptions()"
                            optionLabel="label"
                            optionValue="value"
                            [placeholder]="form.district_code ? 'เลือกตำบล' : 'เลือกอำเภอก่อน'"
                            [disabled]="!form.district_code"
                            [filter]="true"
                            filterBy="label"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-12">
                        <label class="field-label">พิกัด / จุดสังเกต</label>
                        <input
                            pInputText
                            class="w-full"
                            [(ngModel)]="form.location_note"
                            (ngModelChange)="onLocationChanged()"
                            placeholder="เช่น ม.2 บ้านบือราแง, ร้านขนมจีนเมืองคอน, 13/6 ม.8"
                        />
                        @if (mapLink()) {
                            <a
                                [href]="mapLink()"
                                target="_blank"
                                rel="noopener"
                                class="inline-flex items-center gap-1 text-sm mt-1.5"
                            >
                                <i class="pi pi-external-link"></i> เปิดแผนที่
                            </a>
                        }
                    </div>
                </div>
            </div>

            <!-- Card 4 - the patient -->
            <div class="form-card">
                <div class="form-card-title"><i class="pi pi-heart"></i> ผู้ประสบภัย</div>
                <div class="grid grid-cols-12 gap-3">
                    <div class="col-span-6 md:col-span-4">
                        <label class="field-label">เพศ</label>
                        <p-select
                            [(ngModel)]="form.gender"
                            (ngModelChange)="onChanged()"
                            [options]="dataService.genders()"
                            optionLabel="label"
                            optionValue="code"
                            placeholder="-"
                            [showClear]="true"
                            styleClass="w-full"
                            appendTo="body"
                        />
                    </div>
                    <div class="col-span-6 md:col-span-3">
                        <label class="field-label">อายุ</label>
                        <p-inputnumber
                            [(ngModel)]="form.age"
                            (ngModelChange)="onChanged()"
                            [min]="0"
                            [max]="130"
                            [useGrouping]="false"
                            placeholder="-"
                            styleClass="w-full"
                            inputStyleClass="w-full"
                        />
                    </div>
                    <div class="hidden md:block md:col-span-5"></div>

                    <div class="col-span-12">
                        <label class="field-label required">อาการสำคัญ / รายละเอียด</label>
                        <textarea
                            pTextarea
                            class="w-full"
                            rows="4"
                            [(ngModel)]="form.chief_complaint"
                            (ngModelChange)="onChanged()"
                            placeholder="เช่น ผป.ติดเตียง บริเวณรอบบ้านน้ำท่วม"
                        ></textarea>
                    </div>
                </div>
            </div>

            <!-- Card 5 - what was done. Collapsed while taking the call,
                 because none of it is known yet; opened straight away when
                 editing, because it is what the operator came back to fill. -->
            <div class="form-card" #actionCard>
                <div
                    class="form-card-title cursor-pointer select-none justify-between"
                    (click)="actionCardOpen.set(!actionCardOpen())"
                >
                    <span class="flex items-center gap-2">
                        <i class="pi pi-truck"></i> การดำเนินการ
                    </span>
                    <i class="pi" [class.pi-chevron-down]="!actionCardOpen()" [class.pi-chevron-up]="actionCardOpen()"></i>
                </div>

                @if (actionCardOpen()) {
                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label">ประสานงานทีม ปภ.อำเภอ</label>
                            <input
                                pInputText
                                class="w-full"
                                [(ngModel)]="form.ddpm_coordination"
                                (ngModelChange)="onChanged()"
                            />
                        </div>
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label">หน่วยปฏิบัติ</label>
                            <!-- Suggested from units already used in the rows
                                 on screen, so the same unit is not typed three
                                 different ways across one flood. -->
                            <p-autocomplete
                                [(ngModel)]="form.operating_unit"
                                (ngModelChange)="onChanged()"
                                [suggestions]="unitSuggestions()"
                                (completeMethod)="searchUnits($event)"
                                [dropdown]="true"
                                placeholder="เช่น กู้ชีพเต็กก่า, อบต.ปากล่อ"
                                styleClass="w-full"
                                appendTo="body"
                            />
                        </div>

                        <div class="col-span-12">
                            <label class="field-label">การช่วยเหลือ</label>
                            <textarea
                                pTextarea
                                class="w-full"
                                rows="3"
                                [(ngModel)]="form.assistance"
                                (ngModelChange)="onChanged()"
                            ></textarea>
                        </div>

                        <div class="col-span-12 md:col-span-4">
                            <label class="field-label">สำเร็จ</label>
                            <p-select
                                [(ngModel)]="form.status"
                                (ngModelChange)="onChanged()"
                                [options]="dataService.lookups()?.statuses ?? []"
                                optionLabel="label"
                                optionValue="code"
                                styleClass="w-full"
                                appendTo="body"
                            />
                        </div>
                        <div class="hidden md:block md:col-span-8"></div>

                        <div class="col-span-12">
                            <label class="field-label">เพิ่มเติม</label>
                            <textarea
                                pTextarea
                                class="w-full"
                                rows="3"
                                [(ngModel)]="form.remarks"
                                (ngModelChange)="onChanged()"
                            ></textarea>
                        </div>
                    </div>
                }
            </div>

            <div class="action-bar flex flex-wrap items-center gap-2 justify-end">
                @if (draftSavedAt()) {
                    <span class="text-xs text-surface-500 mr-auto">
                        <i class="pi pi-save mr-1"></i>บันทึกร่างอัตโนมัติ {{ draftSavedAt() }}
                    </span>
                }
                <button
                    pButton
                    type="button"
                    label="ยกเลิก"
                    class="p-button-text"
                    [disabled]="saving()"
                    (click)="requestClose()"
                ></button>
                <button
                    pButton
                    type="button"
                    label="บันทึก"
                    icon="pi pi-check"
                    class="p-button-outlined"
                    [loading]="saving()"
                    (click)="save(false)"
                ></button>
                @if (isNew()) {
                    <button
                        pButton
                        type="button"
                        label="บันทึกและรับแจ้งถัดไป"
                        icon="pi pi-forward"
                        [loading]="saving()"
                        (click)="save(true)"
                    ></button>
                }
            </div>
        </p-drawer>
    `
})
export class FloodCaseFormDrawer {
    readonly dataService = inject(FloodDataService);
    private readonly api = inject(FloodApiService);
    private readonly drafts = inject(FloodDraftService);
    private readonly messageService = inject(MessageService);
    private readonly confirmationService = inject(ConfirmationService);

    // 'new', a case id, or null when the drawer is closed. Driven by the URL
    // query parameter so a refresh keeps the case open and a link to one can
    // be pasted into a chat.
    readonly caseId = input<string | null>(null);
    readonly closed = output<void>();
    readonly savedCase = output<FloodCase>();
    readonly requestOpenCase = output<string>();

    private readonly reporterInput = viewChild<any>('reporterInput');
    private readonly actionCard = viewChild<any>('actionCard');

    form: FormModel = emptyForm();

    readonly saving = signal(false);
    readonly dirty = signal(false);
    readonly loaded = signal<FloodCase | null>(null);
    readonly actionCardOpen = signal(false);
    readonly restoredDraft = signal(false);
    readonly draftSavedAt = signal<string>('');
    readonly duplicates = signal<FloodDuplicate[]>([]);
    readonly duplicateWindow = signal(6);
    readonly unitSuggestions = signal<string[]>([]);

    readonly open = computed(() => this.caseId() !== null);
    readonly isNew = computed(() => this.caseId() === 'new');

    // `form` is a plain object so [(ngModel)] can write into it directly. That
    // makes it invisible to `computed`, which caches until a signal it read
    // changes - so the two values derived from it are mirrored into signals
    // here and refreshed by `syncDerived()` wherever the form is touched.
    // Without this the tambon list is computed once, while the form is empty,
    // and never again: choosing an amphoe left the dropdown showing
    // "No results found".
    private readonly districtCodeSignal = signal<string | null>(null);
    private readonly locationNoteSignal = signal<string>('');

    readonly subdistrictOptions = computed(() => this.dataService.subdistrictOptionsFor(this.districtCodeSignal()));

    // Only when the operator actually pasted coordinates or a maps link -
    // the column is called "พิกัด" but almost every real value is a landmark,
    // so this is an opportunistic extra, never a validation rule.
    readonly mapLink = computed(() => {
        const note = this.locationNoteSignal().trim();
        if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(note)) return note;
        const coords = /^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/.exec(note);
        return coords ? `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[2]}` : null;
    });

    private autosaveTimer: ReturnType<typeof setInterval> | null = null;
    private duplicateTimer: ReturnType<typeof setTimeout> | null = null;
    private lastInitialised: string | null = null;

    constructor() {
        effect(() => {
            const id = this.caseId();
            if (id === this.lastInitialised) return;
            this.lastInitialised = id;
            if (id === null) {
                this.teardown();
            } else {
                this.initialise(id);
            }
        });
    }

    // --- opening ------------------------------------------------------------

    private initialise(id: string): void {
        this.duplicates.set([]);
        this.restoredDraft.set(false);
        this.draftSavedAt.set('');
        this.dirty.set(false);

        if (id === 'new') {
            this.loaded.set(null);
            this.form = emptyForm();
            this.syncDerived();
            // Collapsed: none of it can be answered while the call is live.
            this.actionCardOpen.set(false);
            this.applyDraft('new');
            this.startAutosave('new');
        } else {
            this.api.getCase(id).subscribe({
                next: ({ case: found }) => {
                    this.loaded.set(found);
                    this.form = this.toForm(found);
                    this.syncDerived();
                    // Open, and scrolled to: this is what the operator came
                    // back for.
                    this.actionCardOpen.set(true);
                    this.applyDraft(id);
                    this.startAutosave(id);
                    setTimeout(() => this.actionCard()?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
                },
                error: () => {
                    this.messageService.add({ severity: 'error', summary: 'ไม่พบเคสนี้', life: 4000 });
                    this.closed.emit();
                }
            });
        }
    }

    private applyDraft(key: string): void {
        const draft = this.drafts.readDraft(key);
        if (!draft) return;
        const restored = draft.form as Record<string, unknown>;
        this.form = {
            ...this.form,
            ...(restored as unknown as FormModel),
            // Dates survive JSON as strings and have to come back as Dates or
            // the pickers render blank.
            reported_date: restored['reported_date'] ? new Date(restored['reported_date'] as string) : this.form.reported_date,
            reported_time: restored['reported_time'] ? new Date(restored['reported_time'] as string) : this.form.reported_time
        };
        this.syncDerived();
        this.restoredDraft.set(true);
        this.dirty.set(true);
        if (this.form.ddpm_coordination || this.form.operating_unit || this.form.assistance || this.form.remarks) {
            this.actionCardOpen.set(true);
        }
    }

    onShown(): void {
        // Date, time and shift are already filled in by the system, so the
        // cursor starts at the first thing the caller actually says.
        setTimeout(() => this.reporterInput()?.nativeElement?.focus(), 60);
    }

    private startAutosave(key: string): void {
        this.stopAutosave();
        this.autosaveTimer = setInterval(() => {
            if (!this.dirty()) return;
            this.drafts.saveDraft(key, this.form as unknown as Record<string, unknown>);
            this.draftSavedAt.set(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
        }, AUTOSAVE_INTERVAL_MS);
    }

    private stopAutosave(): void {
        if (this.autosaveTimer) clearInterval(this.autosaveTimer);
        this.autosaveTimer = null;
    }

    private teardown(): void {
        this.stopAutosave();
        if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
        this.duplicateTimer = null;
        this.duplicates.set([]);
        this.dirty.set(false);
    }

    // --- editing ------------------------------------------------------------

    /** Refresh the signal mirrors of the form fields other state derives from. */
    private syncDerived(): void {
        this.districtCodeSignal.set(this.form.district_code);
        this.locationNoteSignal.set(this.form.location_note ?? '');
    }

    onChanged(): void {
        this.dirty.set(true);
    }

    setReporter(value: string): void {
        this.form.reporter = value;
        this.onChanged();
    }

    onPhoneChanged(): void {
        this.onChanged();
        this.scheduleDuplicateCheck();
    }

    onLocationChanged(): void {
        this.locationNoteSignal.set(this.form.location_note ?? '');
        this.onChanged();
        this.scheduleDuplicateCheck();
    }

    onDistrictChanged(districtCode: string | null): void {
        // Clearing the tambon is the point of the dependency: keeping the old
        // one would leave a pair from two different amphoe on screen.
        this.form.subdistrict_code = null;
        this.districtCodeSignal.set(districtCode);
        const district = this.dataService.districtByCode(districtCode);
        const suggestion = district ? `ประสานงานทีมปภ.อำเภอ${district.district_name}` : '';
        // Only fills a blank or a previous suggestion - never overwrites
        // something the operator typed.
        if (!this.form.ddpm_coordination || this.form.ddpm_coordination.startsWith('ประสานงานทีมปภ.อำเภอ')) {
            this.form.ddpm_coordination = suggestion;
        }
        this.onChanged();
        this.scheduleDuplicateCheck();
    }

    searchUnits(event: { query: string }): void {
        const query = (event.query ?? '').toLowerCase();
        const seen = new Set<string>();
        for (const item of this.dataService.cases()) {
            const unit = item.operating_unit?.trim();
            if (unit && unit.toLowerCase().includes(query)) seen.add(unit);
        }
        this.unitSuggestions.set([...seen].sort().slice(0, 15));
    }

    // --- duplicates ---------------------------------------------------------

    private scheduleDuplicateCheck(): void {
        if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
        this.duplicateTimer = setTimeout(() => this.runDuplicateCheck(), DUPLICATE_DEBOUNCE_MS);
    }

    private runDuplicateCheck(): void {
        const phone = this.form.phone?.replace(/\D/g, '') ?? '';
        const subdistrictCode = this.form.subdistrict_code;
        const note = this.form.location_note?.trim() ?? '';
        if (!phone && !(subdistrictCode && note)) {
            this.duplicates.set([]);
            return;
        }
        this.api
            .checkDuplicates({
                phone: phone || null,
                subdistrictCode: subdistrictCode,
                locationNote: note || null,
                exclude: this.isNew() ? null : this.caseId()
            })
            .subscribe({
                next: (result) => {
                    this.duplicates.set(result.matches);
                    this.duplicateWindow.set(result.window_hours);
                },
                // A failed advisory check must never interrupt the call.
                error: () => this.duplicates.set([])
            });
    }

    openDuplicate(caseId: string): void {
        this.requestOpenCase.emit(caseId);
    }

    // --- saving -------------------------------------------------------------

    private toForm(item: FloodCase): FormModel {
        const at = new Date(item.reported_at);
        return {
            reported_date: at,
            reported_time: at,
            shift: (item.shift || null) as FloodShift | null,
            agent_name: item.agent_name || null,
            channel: item.channel || null,
            reporter: item.reporter ?? '',
            phone: item.phone_display ?? '',
            district_code: item.district_code || null,
            subdistrict_code: item.subdistrict_code || null,
            location_note: item.location_note ?? '',
            gender: item.gender || null,
            age: item.age,
            chief_complaint: item.chief_complaint ?? '',
            ddpm_coordination: item.ddpm_coordination ?? '',
            operating_unit: item.operating_unit ?? '',
            status: item.status ?? 'pending',
            assistance: item.assistance ?? '',
            remarks: item.remarks ?? ''
        };
    }

    private toPayload(): FloodCaseInput | null {
        if (!this.form.district_code || !this.form.subdistrict_code || !this.form.chief_complaint.trim()) {
            this.messageService.add({
                severity: 'warn',
                summary: 'กรอกข้อมูลไม่ครบ',
                detail: 'ต้องระบุ อำเภอ ตำบล และอาการสำคัญ',
                life: 4000
            });
            return null;
        }

        // The two inputs are merged into one instant here - the form shows
        // them apart because that is how a call goes, but every query on the
        // collection is a time range.
        const date = this.form.reported_date ?? new Date();
        const time = this.form.reported_time ?? new Date();
        const reportedAt = `${formatDateParam(date)}T${`${time.getHours()}`.padStart(2, '0')}:${`${time.getMinutes()}`.padStart(2, '0')}:00`;

        const agent = this.dataService.agents().find((a) => a.agent_name === this.form.agent_name);

        return {
            district: this.form.district_code,
            subdistrict: this.form.subdistrict_code,
            chief_complaint: this.form.chief_complaint.trim(),
            reported_at: reportedAt,
            shift: this.form.shift,
            agent_name: this.form.agent_name,
            agent_extension: agent?.agent_extension ?? null,
            channel: this.form.channel,
            reporter: this.form.reporter?.trim() || null,
            phone: this.form.phone?.trim() || null,
            location_note: this.form.location_note?.trim() || null,
            gender: this.form.gender,
            age: this.form.age,
            ddpm_coordination: this.form.ddpm_coordination?.trim() || null,
            operating_unit: this.form.operating_unit?.trim() || null,
            assistance: this.form.assistance?.trim() || null,
            status: this.form.status,
            remarks: this.form.remarks?.trim() || null
        };
    }

    save(andNext: boolean): void {
        const payload = this.toPayload();
        if (!payload) return;
        const key = this.caseId() ?? 'new';
        this.saving.set(true);

        const request = this.isNew() ? this.api.createCase(payload) : this.api.updateCase(key, payload);

        request.subscribe({
            next: ({ case: saved }) => {
                this.saving.set(false);
                this.drafts.clearDraft(key);
                this.dirty.set(false);
                this.restoredDraft.set(false);
                this.draftSavedAt.set('');
                this.savedCase.emit(saved);
                this.messageService.add({
                    severity: 'success',
                    summary: 'บันทึกแล้ว',
                    detail: `${saved.time} น. ต.${saved.subdistrict_name}`,
                    life: 2500
                });

                if (andNext) {
                    // Clears and re-focuses without closing: during a bad
                    // night the calls arrive back to back.
                    this.form = emptyForm();
                    this.syncDerived();
                    this.actionCardOpen.set(false);
                    this.duplicates.set([]);
                    this.onShown();
                } else {
                    this.closed.emit();
                }
            },
            error: (err) => {
                this.saving.set(false);
                // A 400 is the server refusing the data - queueing it would
                // retry the same rejection forever. Only a transport failure
                // is worth holding on to.
                const isTransport = err?.status === 0 || err?.status >= 500;
                if (isTransport && this.isNew()) {
                    const label = `${this.form.reporter || 'ไม่ระบุผู้แจ้ง'} · ${this.form.chief_complaint.slice(0, 30)}`;
                    this.drafts.enqueue(payload, label, err?.message ?? 'ส่งไม่สำเร็จ');
                    this.drafts.clearDraft(key);
                    this.dirty.set(false);
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'ยังไม่ได้บันทึกจริง',
                        detail: 'เน็ตมีปัญหา — เก็บไว้ในคิวและจะส่งซ้ำอัตโนมัติ',
                        life: 6000
                    });
                    this.closed.emit();
                } else {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'บันทึกไม่สำเร็จ',
                        detail: err?.error?.detail ?? 'กรุณาตรวจสอบข้อมูลแล้วลองใหม่',
                        life: 6000
                    });
                }
            }
        });
    }

    // --- closing ------------------------------------------------------------

    requestClose(): void {
        if (!this.dirty()) {
            this.closed.emit();
            return;
        }
        // Eight hours into a shift somebody will click this by accident.
        this.confirmationService.confirm({
            header: 'ปิดโดยไม่บันทึก?',
            message: 'ข้อมูลที่กรอกไว้ยังไม่ถูกบันทึก ต้องการปิดหรือไม่ (ร่างจะถูกเก็บไว้ให้)',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'ปิดหน้าต่าง',
            rejectLabel: 'กรอกต่อ',
            accept: () => {
                // The draft is kept deliberately: closing is not discarding,
                // and reopening restores exactly what was typed.
                this.drafts.saveDraft(this.caseId() ?? 'new', this.form as unknown as Record<string, unknown>);
                this.closed.emit();
            }
        });
    }

    discardDraft(): void {
        this.drafts.clearDraft(this.caseId() ?? 'new');
        this.form = this.isNew() ? emptyForm() : this.toForm(this.loaded()!);
        this.syncDerived();
        this.restoredDraft.set(false);
        this.dirty.set(false);
        this.draftSavedAt.set('');
    }
}
