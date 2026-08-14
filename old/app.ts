import {isPlatformBrowser, KeyValuePipe, NgTemplateOutlet} from '@angular/common';
import {toSignal} from '@angular/core/rxjs-interop';
import {TuiHovered, TuiPlatform} from '@taiga-ui/cdk';
import {TuiResponsiveDialogService} from '@taiga-ui/addon-mobile';
import {type PolymorpheusContent} from '@taiga-ui/polymorpheus';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    computed,
    inject,
    OnDestroy,
    PLATFORM_ID,
    signal,
} from '@angular/core';
import {
    FormControl,
    FormGroup,
    FormsModule,
    ReactiveFormsModule,
    ValidatorFn,
    Validators,
} from '@angular/forms';
import {RouterLink} from '@angular/router';
import {TuiDay} from '@taiga-ui/cdk';
import {
    TuiButton,
    TuiCell,
    TuiDataList,
    TuiDialogService,
    TuiDropdown,
    TuiError,
    TuiGroup,
    TuiIcon,
    TuiLabel,
    TuiRadio,
    TuiRoot,
    TuiTextfield,
    TuiTitle,
    TuiInput,
    TuiLink,
    TUI_MONTHS,
    TUI_SHORT_WEEK_DAYS,
} from '@taiga-ui/core';
import {
    TuiAutoColorPipe,
    TuiAvatar,
    TuiBadge,
    TuiBlock,
    TuiChevron,
    TuiConfirmService,
    TuiDataListDropdownManager,
    TuiDataListWrapper,
    TuiFade,
    TuiInitialsPipe,
    TuiInputDate,
    TuiRadioList,
    TuiSelect,
    TuiSwitch,
    TuiTabs,
    TuiBreadcrumbs,
    TUI_CONFIRM,
    type TuiConfirmData,
} from '@taiga-ui/kit';
import {TuiCardLarge, TuiForm, TuiHeader, TuiNavigation} from '@taiga-ui/layout';
import {SettingsComponent} from './settings/settings.component';
import {ApiService, type IncidentSummary} from './services/api.service';
import {TuiLegendItem, TuiRingChart} from '@taiga-ui/addon-charts';
import {TuiAmountPipe} from '@taiga-ui/addon-commerce';

const ICON =
    "data:image/svg+xml,%0A%3Csvg width='32' height='32' viewBox='0 0 32 32' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='32' height='32' rx='8' fill='url(%23paint0_linear_2036_35276)'/%3E%3Cmask id='mask0_2036_35276' style='mask-type:alpha' maskUnits='userSpaceOnUse' x='6' y='5' width='20' height='21'%3E%3Cpath d='M18.2399 9.36607C21.1347 10.1198 24.1992 9.8808 26 7.4922C26 7.4922 21.5645 5 16.4267 5C11.2888 5 5.36726 8.69838 6.05472 16.6053C6.38707 20.4279 6.65839 23.7948 6.65839 23.7948C8.53323 22.1406 9.03427 19.4433 8.97983 16.9435C8.93228 14.7598 9.55448 12.1668 12.1847 10.4112C14.376 8.94865 16.4651 8.90397 18.2399 9.36607Z' fill='url(%23paint1_linear_2036_35276)'/%3E%3Cpath d='M11.3171 20.2647C9.8683 17.1579 10.7756 11.0789 16.4267 11.0789C20.4829 11.0789 23.1891 12.8651 22.9447 18.9072C22.9177 19.575 22.9904 20.2455 23.2203 20.873C23.7584 22.3414 24.7159 24.8946 24.7159 24.8946C23.6673 24.5452 22.8325 23.7408 22.4445 22.7058L21.4002 19.921L21.2662 19.3848C21.0202 18.4008 20.136 17.7104 19.1217 17.7104H17.5319L17.6659 18.2466C17.9119 19.2306 18.7961 19.921 19.8104 19.921L22.0258 26H10.4754C10.7774 24.7006 12.0788 23.2368 11.3171 20.2647Z' fill='url(%23paint2_linear_2036_35276)'/%3E%3C/mask%3E%3Cg mask='url(%23mask0_2036_35276)'%3E%3Crect x='4' y='4' width='24' height='24' fill='white'/%3E%3C/g%3E%3Cdefs%3E%3ClinearGradient id='paint0_linear_2036_35276' x1='0' y1='0' x2='32' y2='32' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23A681D4'/%3E%3Cstop offset='1' stop-color='%237D31D4'/%3E%3C/linearGradient%3E%3ClinearGradient id='paint1_linear_2036_35276' x1='6.0545' y1='24.3421' x2='28.8119' y2='3.82775' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0.0001' stop-opacity='0.996458'/%3E%3Cstop offset='0.317708'/%3E%3Cstop offset='1' stop-opacity='0.32'/%3E%3C/linearGradient%3E%3ClinearGradient id='paint2_linear_2036_35276' x1='6.0545' y1='24.3421' x2='28.8119' y2='3.82775' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0.0001' stop-opacity='0.996458'/%3E%3Cstop offset='0.317708'/%3E%3Cstop offset='1' stop-opacity='0.32'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E%0A";

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
    'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
    'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const radioRequired: ValidatorFn = (control) =>
    control.value !== false && control.value !== null ? null : {required: true};

function getCurrentShiftName(): string {
    const now = new Date();
    const total = now.getHours() * 60 + now.getMinutes();
    if (total >= 8 * 60 + 30 && total < 16 * 60 + 30) return 'เช้า';
    if (total >= 16 * 60 + 30 || total < 30) return 'บ่าย';
    return 'ดึก';
}

// For 00:00–00:30 (tail of บ่าย shift), the "date" belongs to the previous calendar day
function getInitialDateValue(): TuiDay {
    const now = new Date();
    const total = now.getHours() * 60 + now.getMinutes();
    if (total < 30) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return new TuiDay(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return TuiDay.currentLocal();
}

function msUntilNextShiftBoundary(): number {
    const now = new Date();
    const nowMs =
        (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 +
        now.getMilliseconds();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const minBoundary of [30, 510, 990]) {
        const boundaryMs = minBoundary * 60 * 1000;
        if (boundaryMs > nowMs) return boundaryMs - nowMs;
    }
    return dayMs - nowMs + 30 * 60 * 1000;
}

@Component({
    selector: 'app-root',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        KeyValuePipe,
        NgTemplateOutlet,
        RouterLink,
        TuiAmountPipe,
        TuiAutoColorPipe,
        TuiAvatar,
        TuiBadge,
        TuiButton,
        TuiCardLarge,
        TuiCell,
        TuiChevron,
        TuiDataList,
        TuiDataListDropdownManager,
        TuiDataListWrapper,
        TuiDropdown,
        TuiFade,
        TuiForm,
        TuiHeader,
        TuiHovered,
        TuiIcon,
        TuiInitialsPipe,
        TuiInput,
        TuiInputDate,
        TuiLegendItem,
        TuiNavigation,
        TuiPlatform,
        TuiRadioList,
        TuiRingChart,
        TuiRoot,
        TuiSelect,
        TuiSwitch,
        TuiTabs,
        TuiTextfield,
        TuiTitle,
        TuiBreadcrumbs,
        TuiLink,
        TuiLabel,
        TuiBlock,
        TuiError,
        TuiGroup,
        TuiRadio,
        SettingsComponent,
    ],
    templateUrl: './app.html',
    styleUrl: './app.less',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: TUI_MONTHS,
            useValue: signal([
                'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
                'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
                'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
            ] as const),
        },
        {
            provide: TUI_SHORT_WEEK_DAYS,
            useValue: signal([
                'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.',
            ] as const),
        },
        TuiConfirmService,
        {
            provide: TuiDialogService,
            useExisting: TuiResponsiveDialogService,
        },
    ],
})
export class App implements OnDestroy {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly confirm = inject(TuiConfirmService);
    private readonly dialogs = inject(TuiDialogService);
    private readonly api = inject(ApiService);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly now = signal(new Date());
    private readonly intervalId: ReturnType<typeof setInterval> | null = null;
    private shiftCheckTimer: ReturnType<typeof setTimeout> | null = null;
    private eventSource: EventSource | null = null;

    protected readonly timeString = computed(() =>
        this.now().toLocaleTimeString('th-TH', {hour12: false}),
    );

    protected readonly dateString = computed(() => {
        const d = this.now();
        const day = DAYS[d.getDay()];
        const date = d.getDate();
        const month = MONTHS[d.getMonth()];
        const year = d.getFullYear() + 543;
        return `วัน${day}ที่ ${date} ${month} ${year}`;
    });

    protected readonly shift = computed(() => `เวร${getCurrentShiftName()}`);

    // ── Summary data ─────────────────────────────────────────────────────────
    protected readonly summary = signal<IncidentSummary | null>(null);
    protected readonly previousSummary = signal<IncidentSummary | null>(null);
    protected readonly dailyChartValues = signal<number[]>([0, 0, 0]);
    protected readonly previousDailyChartValues = signal<number[]>([0, 0, 0]);

    protected readonly summaryDiff = computed(() => {
        const cur = this.summary();
        const prev = this.previousSummary();
        if (!cur || !prev) return null;
        return {
            total: cur.total - prev.total,
            incident: cur['แจ้งเหตุ'].total - prev['แจ้งเหตุ'].total,
            additional: cur['แจ้งเพิ่มเติม เหตุเดียวกัน'] - prev['แจ้งเพิ่มเติม เหตุเดียวกัน'],
            consult: cur['ปรึกษา'] - prev['ปรึกษา'],
            dropped: cur['สายหลุด'] - prev['สายหลุด'],
            nuisance: cur['ก่อกวน'] - prev['ก่อกวน'],
        };
    });

    protected readonly incidentCounts = computed(() => {
        const s = this.summary();
        return {
            total: s?.['แจ้งเหตุ'].total ?? 0,
            c1669: s?.['แจ้งเหตุ']['1669'] ?? 0,
            c2nd: s?.['แจ้งเหตุ']['2nd'] ?? 0,
            radio: s?.['แจ้งเหตุ']['วิทยุ'] ?? 0,
            trauma: s?.['แจ้งเหตุ'].trauma ?? 0,
            nonTrauma: s?.['แจ้งเหตุ'].non_trauma ?? 0,
        };
    });

    protected readonly chartValue = computed(() => this.dailyChartValues());
    protected readonly chartSum = computed(() =>
        this.dailyChartValues().reduce((a, b) => a + b, 0),
    );
    protected readonly dailyChartDiff = computed(
        () =>
            this.dailyChartValues().reduce((a, b) => a + b, 0) -
            this.previousDailyChartValues().reduce((a, b) => a + b, 0),
    );

    // ── Date / shift controls ─────────────────────────────────────────────────
    protected readonly dateMin = new TuiDay(2026, 2, 16);
    protected readonly dateMax = new TuiDay(2031, 11, 31);
    protected dateValue = getInitialDateValue();
    protected readonly shifts = ['ดึก', 'เช้า', 'บ่าย'];
    protected selectedShift: string | null = getCurrentShiftName();

    protected readonly expanded = signal(false);
    protected open = false;
    protected switch = false;
    protected readonly routes: any = {};
    protected readonly breadcrumbs = ['Home', 'Angular', 'Repositories', 'Taiga UI'];

    protected readonly drawer = {
        Components: [
            {name: 'Button', icon: ICON},
            {name: 'Input', icon: ICON},
            {name: 'Tooltip', icon: ICON},
        ],
        Essentials: [
            {name: 'Getting started', icon: ICON},
            {name: 'Showcase', icon: ICON},
            {name: 'Typography', icon: ICON},
        ],
    };

    protected chartActiveItemIndex = Number.NaN;
    protected readonly chartLabels = ['ดึก', 'เช้า', 'บ่าย'];

    constructor() {
        if (this.isBrowser) {
            this.intervalId = setInterval(() => this.now.set(new Date()), 1000);
            this.loadSummary();
            this.scheduleShiftCheck();

            this.eventSource = this.api.subscribeToEvents();
            this.eventSource.addEventListener('incident_created', () => {
                this.loadSummary();
            });
        }
    }

    ngOnDestroy(): void {
        if (this.intervalId !== null) clearInterval(this.intervalId);
        if (this.shiftCheckTimer !== null) clearTimeout(this.shiftCheckTimer);
        this.eventSource?.close();
    }

    // ── Date/shift helpers ────────────────────────────────────────────────────

    private getDateString(): string {
        const d = this.dateValue;
        return `${d.year}-${String(d.month + 1).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    }

    private getShiftId(): number {
        const ids: Record<string, number> = {เช้า: 1, บ่าย: 2, ดึก: 3};
        return ids[this.selectedShift ?? 'เช้า'] ?? 1;
    }

    private getPreviousDateString(): string {
        const d = new Date(`${this.getDateString()}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private scheduleShiftCheck(): void {
        this.shiftCheckTimer = setTimeout(() => {
            this.selectedShift = getCurrentShiftName();
            this.dateValue = getInitialDateValue();
            this.loadSummary();
            this.scheduleShiftCheck();
            this.cdr.markForCheck();
        }, msUntilNextShiftBoundary() + 100);
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    private loadSummary(): void {
        const date = this.getDateString();
        const shiftId = this.getShiftId();
        const prevDate = this.getPreviousDateString();

        this.api.getIncidentSummary(date, shiftId).subscribe((data) => {
            this.summary.set(data);
        });

        this.api.getIncidentSummary(prevDate, shiftId).subscribe((data) => {
            this.previousSummary.set(data);
        });

        this.api.getDailyShiftTotals(date).subscribe((totals) => {
            this.dailyChartValues.set(totals);
        });

        this.api.getDailyShiftTotals(prevDate).subscribe((totals) => {
            this.previousDailyChartValues.set(totals);
        });
    }

    protected handleToggle(): void {
        this.expanded.update((e) => !e);
    }

    protected resetToToday(): void {
        this.dateValue = getInitialDateValue();
        this.selectedShift = getCurrentShiftName();
        this.loadSummary();
    }

    protected onDateChange(day: TuiDay | null): void {
        if (day) {
            this.loadSummary();
        }
    }

    protected onShiftChange(_shift: string | null): void {
        this.loadSummary();
    }

    // ── Badge helpers ─────────────────────────────────────────────────────────

    protected badgeClass(diff: number): string {
        if (diff > 0) return 'badge-up';
        if (diff < 0) return 'badge-down';
        return 'badge-equal';
    }

    protected badgeIcon(diff: number): string {
        if (diff > 0) return '@tui.arrow-up';
        if (diff < 0) return '@tui.arrow-down';
        return '@tui.target';
    }

    protected diffLabel(diff: number): string {
        if (diff > 0) return `+${diff} เคส มากกว่าเวรที่ผ่านมา`;
        if (diff < 0) return `${diff} เคส น้อยกว่าเวรที่ผ่านมา`;
        return 'เท่ากับเวรที่ผ่านมา';
    }

    protected diffLabelShift(diff: number): string {
        const shift = this.selectedShift ?? 'เช้า';
        if (diff > 0) return `${diff} เคส มากกว่าเวร${shift}ที่ผ่านมา`;
        if (diff < 0) return `${Math.abs(diff)} เคส น้อยกว่าเวร${shift}ที่ผ่านมา`;
        return `เท่ากับเวร${shift}ที่ผ่านมา`;
    }

    protected diffLabelShiftSimple(diff: number): string {
        const shift = this.selectedShift ?? 'เช้า';
        if (diff !== 0) return `${Math.abs(diff)} เคส`;
        return `เท่ากับเวร${shift}ที่ผ่านมา`;
    }

    protected diffLabelDaily(diff: number): string {
        if (diff > 0) return `${diff} เคส มากกว่าวันที่ผ่านมา`;
        if (diff < 0) return `${Math.abs(diff)} เคส น้อยกว่าวันที่ผ่านมา`;
        return 'เท่ากับวันที่ผ่านมา';
    }

    // ── Chart helpers ─────────────────────────────────────────────────────────

    protected isChartItemActive(index: number): boolean {
        return this.chartActiveItemIndex === index;
    }

    protected onChartHover(index: number, hovered: boolean): void {
        this.chartActiveItemIndex = hovered ? index : Number.NaN;
    }

    // ── Incident dialog ───────────────────────────────────────────────────────

    protected readonly incidentTypes = ['แจ้งเหตุ', 'แจ้งเพิ่มเติม เหตุเดียวกัน', 'ปรึกษา', 'สายหลุด', 'ก่อกวน'] as const;
    protected readonly incidentSubtypes = ['1669', '2nd', 'วิทยุ'] as const;
    protected readonly incidentLevels = [
        {label: 'Trauma', value: 'trauma'},
        {label: 'NonTrauma', value: 'non-trauma'},
    ] as const;

    private readonly rawCbdCriteria = toSignal(this.api.getCbdCriteria(), {initialValue: []});
    private readonly rawCbdLevels = toSignal(this.api.getCbdLevel(), {initialValue: []});

    protected readonly cbdCriteriaItems = computed(() =>
        this.rawCbdCriteria().map((c) => c.cbdcriteria_detail),
    );
    protected readonly cbdLevelItems = computed(() =>
        this.rawCbdLevels().map((l) => l.cbdlevel_detail),
    );

    protected readonly recordIncidentForm = new FormGroup({
        type: new FormControl<string | null>(null, Validators.required),
        subtype: new FormControl<string | false>({value: false, disabled: true}, radioRequired),
        level: new FormControl<string | false>({value: false, disabled: true}, radioRequired),
        cbd_criteria: new FormControl<string | null>({value: null, disabled: true}, Validators.required),
        cbd_level: new FormControl<string | null>({value: null, disabled: true}, Validators.required),
    });

    private readonly selectedIncidentType = toSignal(
        this.recordIncidentForm.controls.type.valueChanges,
        {initialValue: null as string | null},
    );

    protected readonly incidentSubfieldsDisabled = computed(
        () => this.selectedIncidentType() !== 'แจ้งเหตุ',
    );

    protected onRecordIncidentClick(content: PolymorpheusContent): void {
        this.recordIncidentForm.reset();
        this.recordIncidentForm.markAsUntouched();
        const {subtype, level, cbd_criteria, cbd_level} = this.recordIncidentForm.controls;
        subtype.reset(false);
        level.reset(false);
        cbd_criteria.reset(null);
        cbd_level.reset(null);
        subtype.disable();
        level.disable();
        cbd_criteria.disable();
        cbd_level.disable();
        this.confirm.markAsPristine();

        const sub = this.recordIncidentForm.valueChanges.subscribe(() =>
            this.confirm.markAsDirty(),
        );

        const typeSub = this.recordIncidentForm.controls.type.valueChanges.subscribe((value) => {
            const {subtype, level, cbd_criteria, cbd_level} = this.recordIncidentForm.controls;
            if (value === 'แจ้งเหตุ') {
                subtype.enable();
                subtype.markAsUntouched();
                level.enable();
                level.markAsUntouched();
                cbd_criteria.enable();
                cbd_criteria.markAsUntouched();
                cbd_level.enable();
                cbd_level.markAsUntouched();
            } else {
                subtype.reset(false);
                level.reset(false);
                cbd_criteria.reset(null);
                cbd_level.reset(null);
                subtype.disable();
                level.disable();
                cbd_criteria.disable();
                cbd_level.disable();
            }
        });

        const closable = this.confirm.withConfirm({
            label: 'ยืนยันการออก?',
            data: {content: 'ข้อมูลที่กรอกจะ<strong>ไม่ถูกบันทึก</strong>'},
        });

        this.dialogs
            .open(content, {label: 'บันทึกเหตุ', closable, dismissible: closable, size: 'l'})
            .subscribe({
                complete: () => {
                    sub.unsubscribe();
                    typeSub.unsubscribe();
                    this.confirm.markAsPristine();
                },
                error: () => {
                    sub.unsubscribe();
                    typeSub.unsubscribe();
                    this.confirm.markAsPristine();
                },
            });
    }

    protected onRecordIncidentSave(outerContext: {complete: () => void}): void {
        this.recordIncidentForm.markAllAsTouched();
        if (!this.recordIncidentForm.valid) return;

        const confirmData: TuiConfirmData = {
            content: 'ข้อมูลจะ<strong>ถูกบันทึก</strong>',
            yes: 'ยืนยัน',
            no: 'ยกเลิก',
        };

        this.dialogs
            .open<boolean>(TUI_CONFIRM, {
                label: 'ยืนยันการบันทึก?',
                size: 's',
                data: confirmData,
            })
            .subscribe({
                next: (confirmed) => {
                    if (!confirmed) return;

                    const {type, subtype, level, cbd_criteria, cbd_level} = this.recordIncidentForm.value;
                    this.api
                        .createIncident({
                            date: this.getDateString(),
                            shift_id: this.getShiftId(),
                            type: type ?? '',
                            subtype: (subtype as string | null) || null,
                            level: (level as string | null) || null,
                            cbd_criteria: cbd_criteria || null,
                            cbd_level: cbd_level || null,
                        })
                        .subscribe(() => {
                            this.loadSummary();
                            outerContext.complete();
                        });
                },
            });
    }

}
