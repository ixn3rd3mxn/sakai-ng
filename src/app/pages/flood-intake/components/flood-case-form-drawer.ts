import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { DatePicker, DatePickerModule } from 'primeng/datepicker';
import { Drawer, DrawerModule } from 'primeng/drawer';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { KeyFilterModule } from 'primeng/keyfilter';
import { MessageModule } from 'primeng/message';
import { Select, SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { formatDateParam, parseIsoDate, toBuddhistYear } from '../../dashboardclone/services/date-utils';
import { FloodAgent, FloodCase, FloodCaseInput, FloodCasePatch, FloodDuplicate, FloodHistoryChange, FloodHistoryEntry, FloodShift } from '../flood-intake.types';
import { FloodApiService } from '../services/flood-api.service';
import { FloodDataService } from '../services/flood-data.service';
import { BuddhistYearDirective } from '../../../shared/buddhist-year.directive';
import { NoStrayAutofocusDirective } from '../../../shared/no-stray-autofocus.directive';
import { OpenBelowDirective } from '../../../shared/open-below.directive';
import { groupByRecent, OptionGroup, prependRecent } from '../../../shared/recent-picks';
import { DiffSegment, diffText } from '../../../shared/text-diff';
import { FloodDraftService } from '../services/flood-draft.service';
import { FloodDuplicateWarning } from './flood-duplicate-warning';
import { AppUpdateService } from '../../../core/app-update.service';

type RequiredField = 'district_code' | 'subdistrict_code' | 'location_note' | 'chief_complaint';

interface FormModel {
    reported_date: Date | null;
    reported_time: Date | null;
    shift: FloodShift;
    agent_id: string | null;
    channel_id: number | null;
    // The three autocomplete fields: their clear button writes null, not ''.
    reporter: string | null;
    phone: string;
    district_code: string | null;
    subdistrict_code: string | null;
    location_note: string;
    gender: string | null;
    age: number | null;
    age_months: number | null;
    age_days: number | null;
    chief_complaint: string;
    ddpm_coordination: string | null;
    operating_unit: string | null;
    status: string;
    assistance: string;
    remarks: string;
}

function emptyForm(): FormModel {
    const now = new Date();
    return {
        reported_date: now,
        reported_time: now,
        // Pre-selected from the clock rather than left blank: there is no
        // separate "auto" option any more, so the correct shift has to already
        // be sitting in the field when the drawer opens.
        shift: shiftForTime(now),
        agent_id: null,
        channel_id: null,
        reporter: '',
        phone: '',
        district_code: null,
        subdistrict_code: null,
        location_note: '',
        gender: null,
        age: null,
        age_months: null,
        age_days: null,
        chief_complaint: '',
        ddpm_coordination: '',
        operating_unit: '',
        status: 'pending',
        assistance: '',
        remarks: ''
    };
}

type FormField = keyof FormModel;
const FORM_FIELDS = Object.keys(emptyForm()) as FormField[];

// The form's cards and fields, for the skeleton shown while a case is fetched
// with nothing to show meanwhile. Kept in step with the template by hand:
// same titles, same labels, same column widths, so the grey boxes sit exactly
// where the inputs will. `rows` only for the textareas.
interface SkeletonField {
    label: string;
    cols: string;
    required?: boolean;
    rows?: number;
    // The badge row under the three free-text fields. The badges are fixed
    // text, nothing to do with the case being fetched, so they are shown
    // where they will be - disabled, since there is no field to fill yet.
    shortcuts?: 'reporter' | 'ddpm' | 'crew';
}

// A PrimeNG text box is its lines of text plus 0.5rem padding top and bottom
// and a 1px border each side; `lh` is the inherited line height, so this
// tracks the html line-height in _core.scss rather than restating it.
function skeletonHeight(rows = 1): string {
    return `calc(${rows}lh + 1rem + 2px)`;
}

// One changed field as the history dialog draws it. `segments` is set when
// the two values are close enough to show as one line with only the changed
// characters marked; otherwise the old text is shown struck through in full
// beside the new one.
interface HistoryLine {
    label: string;
    from: string;
    to: string;
    segments: DiffSegment[] | null;
}

interface HistoryView {
    at: string;
    lines: HistoryLine[];
}

function twoDigitBuddhistYear(date: Date): string {
    return `${toBuddhistYear(date)}`.slice(-2);
}

function clockTime(date: Date): string {
    return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

/** "12 ก.ย. 69 08:44 น." - when a history entry was written. Always absolute: a list is read as a timeline, not as recency. */
function formatHistoryTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
    return `${day} ${twoDigitBuddhistYear(date)} ${clockTime(date)} น.`;
}

// The history fields an operator types into, as the backend names them.
// These get an inline diff; the rest are picks from a list.
const FREE_TEXT_HISTORY_FIELDS: ReadonlySet<FloodHistoryChange['field']> = new Set([
    'reporter',
    'location_note',
    'chief_complaint',
    'ddpm_coordination',
    'operating_unit',
    'assistance',
    'remarks'
]);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * How long ago a case was last written, for the drawer header. Relative
 * while that is the readable form - during a flood the only question is
 * whether someone touched this in the last few minutes - and a date once
 * counting hours stops meaning anything.
 */
function formatLastEdited(updatedAt: string, now: number): string {
    // Stored as Bangkok wall-clock with no zone (backend/libs/shift.py),
    // which is what this console runs on, so the plain parse is correct.
    const edited = new Date(updatedAt).getTime();
    if (Number.isNaN(edited)) return '';
    const ago = now - edited;
    // A clock a little behind the server's must not read "in 3 minutes".
    if (ago < MINUTE) return 'เมื่อสักครู่นี้';
    if (ago < HOUR) return `${Math.floor(ago / MINUTE)} นาทีที่แล้ว`;
    if (ago < DAY) return `${Math.floor(ago / HOUR)} ชั่วโมงที่แล้ว`;
    if (ago < WEEK) return `${Math.floor(ago / DAY)} วันที่แล้ว`;
    if (ago < 30 * DAY) return `${Math.floor(ago / WEEK)} สัปดาห์ที่แล้ว`;
    // Past a month the count stops being worth reading, but the date still
    // is - a case nobody has touched since last season is a different thing
    // from one touched in August.
    const date = new Date(edited);
    const day = date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
    // Two-digit Buddhist year, as the paper forms write it: "12 ก.ย. 69".
    // Always shown - at a month out the year is exactly what is in doubt.
    return `นานแล้ว (${day} ${twoDigitBuddhistYear(date)})`;
}
const HALF = 'col-span-12 md:col-span-6';
const THIRD = 'col-span-12 md:col-span-4';
const FULL = 'col-span-12';
const SKELETON_CARDS: { title: string; fields: SkeletonField[] }[] = [
    {
        title: 'ข้อมูลการรับแจ้ง',
        fields: [
            { label: 'วันที่', cols: THIRD },
            { label: 'เวลารับแจ้ง', cols: THIRD },
            { label: 'เวร', cols: THIRD },
            { label: 'เจ้าหน้าที่รับแจ้ง', cols: HALF },
            { label: 'ช่องทาง', cols: HALF }
        ]
    },
    {
        title: 'ผู้แจ้ง',
        fields: [
            { label: 'ผู้แจ้ง', cols: HALF, shortcuts: 'reporter' },
            { label: 'เบอร์โทรศัพท์', cols: HALF }
        ]
    },
    {
        title: 'สถานที่เกิดเหตุ',
        fields: [
            { label: 'อำเภอ', cols: HALF, required: true },
            { label: 'ตำบล', cols: HALF, required: true },
            { label: 'พิกัด & จุดสังเกต', cols: FULL, required: true }
        ]
    },
    {
        title: 'ผู้ประสบภัย',
        fields: [
            { label: 'เพศ', cols: 'col-span-6 md:col-span-3' },
            { label: 'อายุ (ปี)', cols: 'col-span-6 md:col-span-3' },
            { label: 'เดือน', cols: 'col-span-6 md:col-span-3' },
            { label: 'วัน', cols: 'col-span-6 md:col-span-3' },
            { label: 'อาการสำคัญ / รายละเอียด', cols: FULL, required: true, rows: 4 }
        ]
    },
    {
        title: 'การดำเนินการ',
        fields: [
            { label: 'ประสานงานทีม ปภ.อำเภอ', cols: HALF, shortcuts: 'ddpm' },
            { label: 'หน่วยปฏิบัติ', cols: HALF, shortcuts: 'crew' },
            { label: 'การช่วยเหลือ', cols: FULL, rows: 3 },
            { label: 'สำเร็จ', cols: THIRD },
            { label: 'เพิ่มเติม', cols: FULL, rows: 3 }
        ]
    }
];

// Which request fields a form field feeds. A save on an existing case sends
// only the request fields of the form fields that changed, and the server
// writes only those - so two operators finishing different parts of one
// case never overwrite each other. Fields the server validates together
// travel together: the amphoe/tambon pair, the three parts of an age, the
// date and time that make one instant.
const PAYLOAD_FIELDS: Record<FormField, (keyof FloodCaseInput)[]> = {
    reported_date: ['reported_at'],
    reported_time: ['reported_at'],
    shift: ['shift'],
    agent_id: ['agent_id'],
    channel_id: ['channel_id'],
    reporter: ['reporter'],
    phone: ['phone'],
    district_code: ['district', 'subdistrict'],
    subdistrict_code: ['district', 'subdistrict'],
    location_note: ['location_note'],
    gender: ['gender'],
    age: ['age', 'age_months', 'age_days'],
    age_months: ['age', 'age_months', 'age_days'],
    age_days: ['age', 'age_months', 'age_days'],
    chief_complaint: ['chief_complaint'],
    ddpm_coordination: ['ddpm_coordination'],
    operating_unit: ['operating_unit'],
    status: ['status'],
    assistance: ['assistance'],
    remarks: ['remarks']
};

/** A form as the request body - for the save itself, and for its baseline. */
function payloadOf(form: FormModel): FloodCaseInput {
    // The two inputs are merged into one instant here - the form shows them
    // apart because that is how a call goes, but every query on the
    // collection is a time range.
    const date = form.reported_date ?? new Date();
    const time = form.reported_time ?? new Date();
    const reportedAt = `${formatDateParam(date)}T${`${time.getHours()}`.padStart(2, '0')}:${`${time.getMinutes()}`.padStart(2, '0')}:00`;

    return {
        district: form.district_code ?? '',
        subdistrict: form.subdistrict_code ?? '',
        chief_complaint: form.chief_complaint.trim(),
        reported_at: reportedAt,
        shift: form.shift,
        agent_id: form.agent_id,
        channel_id: form.channel_id,
        reporter: form.reporter?.trim() || null,
        phone: form.phone?.trim() || null,
        location_note: form.location_note?.trim() || null,
        gender: form.gender,
        age: form.age,
        age_months: form.age === null ? null : form.age_months,
        age_days: form.age === null || form.age_months === null ? null : form.age_days,
        ddpm_coordination: form.ddpm_coordination?.trim() || null,
        operating_unit: form.operating_unit?.trim() || null,
        assistance: form.assistance?.trim() || null,
        status: form.status,
        remarks: form.remarks?.trim() || null
    };
}

const FIELD_LABELS: Record<FormField, string> = {
    reported_date: 'วันที่',
    reported_time: 'เวลารับแจ้ง',
    shift: 'เวร',
    agent_id: 'เจ้าหน้าที่รับแจ้ง',
    channel_id: 'ช่องทาง',
    reporter: 'ผู้แจ้ง',
    phone: 'เบอร์โทรศัพท์',
    district_code: 'อำเภอ',
    subdistrict_code: 'ตำบล',
    location_note: 'พิกัด & จุดสังเกต',
    gender: 'เพศ',
    age: 'อายุ (ปี)',
    age_months: 'เดือน',
    age_days: 'วัน',
    chief_complaint: 'อาการสำคัญ / รายละเอียด',
    ddpm_coordination: 'ประสานงานทีม ปภ.อำเภอ',
    operating_unit: 'หน่วยปฏิบัติ',
    status: 'สถานะ',
    assistance: 'การช่วยเหลือ',
    remarks: 'เพิ่มเติม'
};

// One comparable shape per field, so "did this change" ignores the noise
// the wire adds: a phone comes back grouped with dashes, text comes back
// trimmed, a time is a Date.
function normalise(field: FormField, value: unknown): unknown {
    if (value instanceof Date) return value.getTime();
    if (value === null || value === undefined) return typeof value === 'string' ? '' : null;
    if (typeof value === 'string') return field === 'phone' ? value.replace(/\D/g, '') : value.trim();
    return value;
}

function sameValue(field: FormField, a: unknown, b: unknown): boolean {
    const x = normalise(field, a);
    const y = normalise(field, b);
    // null and '' are the same emptiness for every field here.
    return (x ?? '') === (y ?? '');
}

// Mirrors libs/shift.py's get_shift exactly:
//   เช้า  08:30:00 - 16:29:59
//   บ่าย  16:30:00 - 00:29:59
//   ดึก   00:30:00 - 08:29:59
// This only decides what the operator sees pre-selected: the form always
// sends a concrete shift and the server validates it, so a drift here would
// show up in the field before it could reach a record.
const MORNING_START_MINUTES = 8 * 60 + 30;
const AFTERNOON_START_MINUTES = 16 * 60 + 30;
const NIGHT_START_MINUTES = 30;

function shiftForTime(at: Date | null): FloodShift {
    if (!at) return 'morning';
    const minutes = at.getHours() * 60 + at.getMinutes();
    if (minutes >= MORNING_START_MINUTES && minutes < AFTERNOON_START_MINUTES) return 'morning';
    if (minutes >= AFTERNOON_START_MINUTES || minutes < NIGHT_START_MINUTES) return 'afternoon';
    return 'night';
}

const DUPLICATE_DEBOUNCE_MS = 500;
// Longer than the drawer's slide-out plus the mask fade, with margin.
const MASK_TEARDOWN_GRACE_MS = 1500;

@Component({
    selector: 'app-flood-case-form-drawer',
    standalone: true,
    host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
    imports: [
        CommonModule,
        FormsModule,
        DrawerModule,
        IconFieldModule,
        InputIconModule,
        ButtonModule,
        InputTextModule,
        KeyFilterModule,
        MessageModule,
        InputNumberModule,
        TextareaModule,
        SelectModule,
        DatePickerModule,
        AutoCompleteModule,
        ConfirmDialogModule,
        DialogModule,
        TooltipModule,
        SkeletonModule,
        BuddhistYearDirective,
        // Every select, autocomplete, picker and number box below would
        // otherwise render with a native autofocus attribute (PrimeNG bug),
        // and the browser hands the first of them focus on a fresh page load.
        NoStrayAutofocusDirective,
        // Every select, autocomplete and date picker below opens its popup
        // under the field - see the directive.
        OpenBelowDirective,
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

            /* The conflict popover under a field. Positioned inside the
               field's own column rather than appended to body, so it
               scrolls with the field and no scroll or stray click can close
               it - PrimeNG's p-popover hides itself on both, and a conflict
               that can vanish unanswered is a conflict decided by accident.
               Drawn with the theme's popover tokens so it looks like one;
               it floats over whatever sits below the field, and is only as
               wide as what it says, not as wide as the field.
               No top: it opens where it sits in the markup, which is
               straight after the input - over a field's shortcut badges
               rather than below them, so the arrow points at the value in
               question. The badges are back once the choice is made. */
            .grid > div:has(> .conflict-popover) {
                position: relative;
            }
            .conflict-popover {
                position: absolute;
                left: 0;
                width: max-content;
                min-width: 12rem;
                max-width: min(24rem, calc(100vw - 3rem));
                z-index: 5;
                margin-top: 0.6rem;
                padding: var(--p-overlay-popover-padding, 0.75rem);
                border: 1px solid var(--p-overlay-popover-border-color, var(--p-content-border-color));
                border-radius: var(--p-overlay-popover-border-radius, var(--p-content-border-radius));
                background: var(--p-overlay-popover-background, var(--p-content-background));
                color: var(--p-overlay-popover-color, var(--p-text-color));
                box-shadow: var(--p-overlay-popover-shadow, 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1));
            }
            .conflict-popover::before,
            .conflict-popover::after {
                content: '';
                position: absolute;
                left: 1.25rem;
                border: 0.5rem solid transparent;
                border-top: 0;
            }
            .conflict-popover::before {
                top: -0.5rem;
                border-bottom-color: var(--p-overlay-popover-border-color, var(--p-content-border-color));
            }
            .conflict-popover::after {
                top: calc(-0.5rem + 1px);
                border-bottom-color: var(--p-overlay-popover-background, var(--p-content-background));
            }
            /* In the flow rather than floating; same look, same arrow. */
            .conflict-popover-inflow {
                position: relative;
                top: auto;
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
            /* A field changed since the case was opened (isChanged). Before
               the text, so it cannot be confused with the required star. */
            .field-changed::before {
                content: '';
                display: inline-block;
                width: 0.4rem;
                height: 0.4rem;
                border-radius: 50%;
                background: var(--p-primary-color);
                margin-inline-end: 0.35rem;
                vertical-align: middle;
            }
            /* Status on the left, actions on the right - and in the same
               column as the dots on the labels it explains. */
            /* A field someone else's save just changed (isRemoteUpdated): the
               input flashes the theme's highlight and a note fades at the
               end of the label row - where the operator is looking, with
               nothing to answer and nothing below it pushed down. Both last
               REMOTE_MARK_MS. */
            .remote-updated {
                position: relative;
            }
            .remote-note {
                position: absolute;
                top: 0;
                inset-inline-end: 0;
                color: var(--p-primary-color);
                pointer-events: none;
                animation: remote-note 3s ease-out forwards;
            }
            @keyframes remote-note {
                0% {
                    opacity: 0;
                }
                10%,
                75% {
                    opacity: 1;
                }
                100% {
                    opacity: 0;
                }
            }
            .grid > div:has(> .remote-updated) ::ng-deep :is(.p-inputtext, .p-select, .p-textarea) {
                animation: remote-flash 3s ease-out;
            }
            @keyframes remote-flash {
                from {
                    background-color: var(--p-highlight-background);
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .remote-note,
                .grid > div:has(> .remote-updated) ::ng-deep :is(.p-inputtext, .p-select, .p-textarea) {
                    animation: none;
                }
            }
            .changed-legend {
                font-size: 0.8rem;
                color: var(--text-color-secondary);
                margin-inline-end: auto;
            }
            /* Room for four or five saves; the ten-entry cap scrolls. On a
               short phone screen the viewport share wins, and the dialog's
               own header and padding still fit. */
            .history-body {
                height: min(22rem, 60vh);
                overflow-y: auto;
                overscroll-behavior: contain;
                padding-right: 0.25rem;
            }
            .history-skeleton {
                height: 100%;
                overflow: hidden;
            }
            .history-loaded {
                animation: history-fade-in 150ms ease-out;
            }
            @keyframes history-fade-in {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
            @media (prefers-reduced-motion: reduce) {
                .history-loaded {
                    animation: none;
                }
            }

            /* One save per block in the history dialog; a change is
               label, old, arrow, new on one line, wrapping on a phone. */
            .history-entry + .history-entry {
                border-top: 1px solid var(--surface-border);
                margin-top: 0.75rem;
                padding-top: 0.75rem;
            }
            .history-when {
                font-size: 0.8rem;
                color: var(--text-color-secondary);
                margin-bottom: 0.35rem;
            }
            .history-change {
                display: flex;
                flex-wrap: wrap;
                align-items: baseline;
                gap: 0.25rem 0.5rem;
                padding: 0.15rem 0;
            }
            .history-label {
                color: var(--text-color-secondary);
                min-width: 9rem;
            }
            .history-label::after {
                content: ':';
            }
            .history-from {
                color: var(--text-color-secondary);
                text-decoration: line-through;
            }
            .history-arrow {
                font-size: 0.7rem;
                color: var(--text-color-secondary);
            }
            .history-to {
                font-weight: 500;
            }
            .history-diff {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }
            /* Red for what went, green for what came - the colours every
               diff uses. A tint of the palette colour over the surface, so
               they read on the dark theme too. */
            .history-diff del,
            .history-diff ins {
                border-radius: 3px;
                padding: 0 0.15em;
            }
            .history-diff del {
                text-decoration: line-through;
                background: color-mix(in srgb, var(--p-red-500) 18%, transparent);
            }
            .history-diff ins {
                text-decoration: none;
                font-weight: 500;
                background: color-mix(in srgb, var(--p-green-500) 22%, transparent);
            }

            /* Always reachable without scrolling to the end of a long form.
               The drawer's content has its stock bottom padding, and a sticky
               bar stops at that padding - leaving a strip under it where the
               form scrolled past in view. Pulled down over the padding (and
               padded back by the same amount, so the buttons stay where they
               were) it sits flush with the drawer's bottom edge. Above the
               conflict popover (z-index 5), which would otherwise draw over
               it on the way past. */
            .action-bar {
                position: sticky;
                bottom: calc(-1 * var(--p-overlay-modal-padding, 1.25rem));
                z-index: 6;
                background: var(--surface-overlay, var(--surface-card));
                border-top: 1px solid var(--surface-border);
                padding: 0.85rem 0 calc(0.85rem + var(--p-overlay-modal-padding, 1.25rem));
                margin-top: 0.5rem;
                margin-bottom: calc(-1 * var(--p-overlay-modal-padding, 1.25rem));
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
            [blockScroll]="true"
            [closable]="false"
            [dismissible]="false"
            [closeOnEscape]="false"
            (onShow)="onShown()"
        >
            <ng-template #header>
                <div class="flex items-center justify-between w-full gap-3">
                    <div>
                        <div class="font-semibold text-lg flex items-baseline gap-2">
                            {{ isNew() ? 'รับแจ้งใหม่' : 'แก้ไขเคส' }}
                            <!-- The label is fixed text and always there; only
                                 the time waits on the case, as a grey bar until
                                 it is in hand. -->
                            @if (!isNew()) {
                                <span class="text-xs font-normal text-surface-500 inline-flex items-baseline gap-1">
                                    แก้ไขล่าสุด
                                    @if (lastEdited(); as edited) {
                                        <span>{{ edited }}</span>
                                    } @else {
                                        <p-skeleton width="5rem" height="0.75rem" />
                                    }
                                </span>
                            }
                        </div>
                    </div>
                    <div class="flex items-center gap-1">
                        @if (!isNew()) {
                            <button
                                pButton
                                type="button"
                                icon="pi pi-history"
                                class="p-button-text p-button-rounded"
                                pTooltip="ประวัติการแก้ไข"
                                tooltipPosition="bottom"
                                aria-label="ประวัติการแก้ไข"
                                [disabled]="showSkeleton()"
                                (click)="openHistory()"
                            ></button>
                        }
                        <button
                            pButton
                            type="button"
                            icon="pi pi-times"
                            class="p-button-text p-button-rounded"
                            (click)="requestClose()"
                        ></button>
                    </div>
                </div>
            </ng-template>

            <app-flood-duplicate-warning
                [matches]="duplicates()"
                [windowHours]="duplicateWindow()"
                (open)="openDuplicate($event)"
            />

            <!-- Only when the case is not in the list on screen (a deep
                 link on a cold page, a duplicate outside the current filter):
                 opened from a row, the form is seeded from that row and
                 never passes through here. The cards, titles and labels are
                 the real ones - they never wait on anything - so only the
                 boxes are grey, and the form does not reflow when it fills. -->
            @if (showSkeleton()) {
                <div aria-busy="true" aria-label="กำลังโหลดเคส">
                    @for (card of SKELETON_CARDS; track card.title) {
                        <div class="form-card">
                            <div class="form-card-title">{{ card.title }}</div>
                            <div class="grid grid-cols-12 gap-3">
                                @for (field of card.fields; track field.label) {
                                    <div [class]="field.cols">
                                        <label class="field-label" [class.required]="field.required">{{ field.label }}</label>
                                        <p-skeleton [height]="skeletonHeight(field.rows)" />
                                        @if (field.shortcuts) {
                                            <ng-container *ngTemplateOutlet="shortcuts; context: { $implicit: shortcutsFor(field.shortcuts), disabled: true }" />
                                        }
                                    </div>
                                }
                            </div>
                        </div>
                    }
                </div>
            } @else {
                <!-- Card 1 - the call itself -->
                <div class="form-card">
                    <div class="form-card-title">ข้อมูลการรับแจ้ง</div>
                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-12 md:col-span-4">
                            <label class="field-label" data-field="reported_date" [class.field-changed]="isChanged('reported_date')" [class.remote-updated]="isRemoteUpdated('reported_date')">วันที่@if (isRemoteUpdated('reported_date')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-datepicker
                                openBelow
                                buddhistYear
                                [(ngModel)]="form.reported_date"
                                (ngModelChange)="onChanged()"
                                dateFormat="dd/mm/yy"
                                [showIcon]="true"
                                [readonlyInput]="true"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'reported_date' }" />
                        </div>
                        <div class="col-span-12 md:col-span-4">
                            <label class="field-label" data-field="reported_time" [class.field-changed]="isChanged('reported_time')" [class.remote-updated]="isRemoteUpdated('reported_time')">เวลารับแจ้ง@if (isRemoteUpdated('reported_time')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-datepicker
                                openBelow
                                [(ngModel)]="form.reported_time"
                                (ngModelChange)="onTimeChanged()"
                                [timeOnly]="true"
                                hourFormat="24"
                                [readonlyInput]="true"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'reported_time' }" />
                        </div>
                        <div class="col-span-12 md:col-span-4">
                            <label class="field-label" data-field="shift" [class.field-changed]="isChanged('shift')" [class.remote-updated]="isRemoteUpdated('shift')">เวร@if (isRemoteUpdated('shift')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- Pre-selected from the report time above, which is
                                 what nearly every case wants, and it keeps
                                 following the time until the operator picks a
                                 shift: a call landing at 16:28 is regularly
                                 written up by the incoming team. -->
                            <p-select
                                openBelow
                                [(ngModel)]="form.shift"
                                (ngModelChange)="onShiftChanged()"
                                [options]="dataService.shifts()"
                                optionLabel="label"
                                optionValue="code"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'shift' }" />
                        </div>

                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="agent_id" [class.field-changed]="isChanged('agent_id')" [class.remote-updated]="isRemoteUpdated('agent_id')">เจ้าหน้าที่รับแจ้ง@if (isRemoteUpdated('agent_id')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- The roster is ordered by roster number, which is
                                 the right order to read but a slow one to pick
                                 from: whoever is on this console picked their own
                                 name on the last call too, so the last three sit
                                 on top. Per browser, never sent anywhere. -->
                            <p-select
                                openBelow
                                #agentSelect
                                [(ngModel)]="form.agent_id"
                                (ngModelChange)="onAgentChanged()"
                                [options]="agentGroups()"
                                [group]="true"
                                optionGroupLabel="label"
                                optionGroupChildren="items"
                                optionLabel="agent_name"
                                optionValue="agent_id"
                                placeholder="เลือกเจ้าหน้าที่"
                                [showClear]="true"
                                [filter]="true"
                                [resetFilterOnHide]="true"
                                filterBy="agent_name"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'agent_id' }" />
                        </div>
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="channel_id" [class.field-changed]="isChanged('channel_id')" [class.remote-updated]="isRemoteUpdated('channel_id')">ช่องทาง@if (isRemoteUpdated('channel_id')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-select
                                openBelow
                                [(ngModel)]="form.channel_id"
                                (ngModelChange)="onChanged()"
                                [options]="dataService.channels()"
                                optionLabel="channel_name"
                                optionValue="channel_id"
                                placeholder="เลือกช่องทาง"
                                [showClear]="true"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'channel_id' }" />
                        </div>
                    </div>
                </div>

                <!-- Card 2 - who is calling -->
                <div class="form-card">
                    <div class="form-card-title">ผู้แจ้ง</div>
                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="reporter" [class.field-changed]="isChanged('reporter')" [class.remote-updated]="isRemoteUpdated('reporter')">ผู้แจ้ง@if (isRemoteUpdated('reporter')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- Free text with help, not a closed list: the real
                                 column holds an organisation type and a tail that
                                 is unpredictable. The dropdown offers every name
                                 seen so far, the badges the common prefixes. No
                                 "No results found" on any of the three: a new
                                 value is the point, and that message reads as
                                 "not allowed". -->
                            <p-autocomplete
                                openBelow
                                #reporterInput
                                (click)="openSuggestions($event, reporterInput)"
                                (onClear)="onCleared(reporterInput)"
                                [(ngModel)]="form.reporter"
                                (ngModelChange)="onChanged()"
                                [suggestions]="reporterSuggestions()"
                                (completeMethod)="reporterSuggestions.set(suggest('reporter', dataService.notifiers(), $event.query))"
                                (onSelect)="onNamePicked('reporter', $event.value)"
                                [group]="true"
                                [dropdown]="true"
                                [showClear]="true"
                                [showEmptyMessage]="false"
                                placeholder="เช่น ญาติ, จนท."
                                styleClass="w-full"
                                inputStyleClass="thai-input"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'reporter' }" />
                            <ng-container
                                *ngTemplateOutlet="shortcuts; context: { $implicit: dataService.reporterShortcuts(), field: 'reporter', input: reporterInput }"
                            />
                        </div>
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="phone" [class.field-changed]="isChanged('phone')" [class.remote-updated]="isRemoteUpdated('phone')">เบอร์โทรศัพท์@if (isRemoteUpdated('phone')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- Plain inputs have no clear button of their own;
                                 an icon field with a × on the right is the stock
                                 way to give them one. -->
                            <p-iconfield>
                                <!-- Digits only, and a text box rather than a
                                     number input because a phone number starts
                                     with 0 and is never arithmetic. -->
                                <input
                                    #phoneInput
                                    pInputText
                                    pKeyFilter="pint"
                                    maxlength="10"
                                    class="w-full"
                                    [ngModel]="form.phone"
                                    (ngModelChange)="onPhoneChanged($event)"
                                    placeholder="เช่น 0998887777"
                                    inputmode="numeric"
                                />
                                @if (form.phone) {
                                    <p-inputicon class="pi pi-times cursor-pointer" (click)="form.phone = ''; onPhoneChanged(); phoneInput.focus()" />
                                }
                            </p-iconfield>
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'phone' }" />
                        </div>
                    </div>
                </div>

                <!-- Card 3 - where -->
                <div class="form-card">
                    <div class="form-card-title">สถานที่เกิดเหตุ</div>
                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label required" data-field="district_code" [class.field-changed]="isChanged('district_code')" [class.remote-updated]="isRemoteUpdated('district_code')">อำเภอ@if (isRemoteUpdated('district_code')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-select
                                openBelow
                                [invalid]="isMissing('district_code')"
                                [(ngModel)]="form.district_code"
                                (ngModelChange)="onDistrictChanged($event)"
                                [options]="districtGroups()"
                                [group]="true"
                                optionGroupLabel="label"
                                optionGroupChildren="items"
                                optionLabel="label"
                                optionValue="value"
                                placeholder="เลือกอำเภอ"
                                [showClear]="true"
                                [filter]="true"
                                [resetFilterOnHide]="true"
                                filterBy="label"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            @if (isMissing('district_code')) {
                                <p-message severity="error" size="small" variant="simple">กรุณาเลือกอำเภอ</p-message>
                            }
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'district_code' }" />
                        </div>
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label required" data-field="subdistrict_code" [class.field-changed]="isChanged('subdistrict_code')" [class.remote-updated]="isRemoteUpdated('subdistrict_code')">ตำบล@if (isRemoteUpdated('subdistrict_code')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- Narrowed by the chosen amphoe once there is one,
                                 so a tambon from the wrong amphoe cannot be picked;
                                 with none chosen it lists every tambon and fills
                                 the amphoe in from whatever is picked. Either way
                                 the pair that reaches the server is consistent -
                                 it rejects a mismatched one anyway. -->
                            <p-select
                                openBelow
                                [invalid]="isMissing('subdistrict_code')"
                                [(ngModel)]="form.subdistrict_code"
                                (ngModelChange)="onSubdistrictChanged()"
                                [options]="subdistrictGroups()"
                                [group]="true"
                                optionGroupLabel="label"
                                optionGroupChildren="items"
                                optionLabel="label"
                                optionValue="value"
                                placeholder="เลือกตำบล"
                                [showClear]="true"
                                [filter]="true"
                                [resetFilterOnHide]="true"
                                filterBy="label"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            @if (isMissing('subdistrict_code')) {
                                <p-message severity="error" size="small" variant="simple">กรุณาเลือกตำบล</p-message>
                            }
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'subdistrict_code' }" />
                        </div>
                        <div class="col-span-12">
                            <label class="field-label required" data-field="location_note" [class.field-changed]="isChanged('location_note')" [class.remote-updated]="isRemoteUpdated('location_note')">พิกัด & จุดสังเกต@if (isRemoteUpdated('location_note')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-iconfield>
                                <input
                                    #locationInput
                                    pInputText
                                    [invalid]="isMissing('location_note')"
                                    class="w-full thai-input"
                                    [(ngModel)]="form.location_note"
                                    (ngModelChange)="onLocationChanged()"
                                    placeholder="เช่น ม.2 บ้านบือราแง, ร้านขนมจีนเมืองคอน, 13/6 ม.8"
                                />
                                @if (form.location_note) {
                                    <p-inputicon class="pi pi-times cursor-pointer" (click)="form.location_note = ''; onLocationChanged(); locationInput.focus()" />
                                }
                            </p-iconfield>
                            @if (isMissing('location_note')) {
                                <p-message severity="error" size="small" variant="simple">กรุณาระบุพิกัดหรือจุดสังเกต</p-message>
                            }
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
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'location_note' }" />
                        </div>
                    </div>
                </div>

                <!-- Card 4 - the patient -->
                <div class="form-card">
                    <div class="form-card-title">ผู้ประสบภัย</div>
                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-6 md:col-span-3">
                            <label class="field-label" data-field="gender" [class.field-changed]="isChanged('gender')" [class.remote-updated]="isRemoteUpdated('gender')">เพศ@if (isRemoteUpdated('gender')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-select
                                openBelow
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
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'gender' }" />
                        </div>
                        <div class="col-span-6 md:col-span-3">
                            <label class="field-label" data-field="age" [class.field-changed]="isChanged('age')" [class.remote-updated]="isRemoteUpdated('age')">อายุ (ปี)@if (isRemoteUpdated('age')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-iconfield>
                                <p-inputnumber
                                    [(ngModel)]="form.age"
                                    (ngModelChange)="onAgeChanged()"
                                    [min]="0"
                                    [max]="130"
                                    [useGrouping]="false"
                                    placeholder="-"
                                    styleClass="w-full"
                                    inputStyleClass="w-full"
                                    [inputStyle]="ageInputStyle"
                                />
                                @if (form.age !== null) {
                                    <p-inputicon class="pi pi-times cursor-pointer" (click)="form.age = null; onAgeChanged()" />
                                }
                            </p-iconfield>
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'age' }" />
                        </div>
                        <!-- For small children - "1 ปี 9 เดือน", "11 เดือน",
                             "5 วัน". Each box needs the one before it, because
                             months of nothing is not an age; the server refuses
                             the pair too. -->
                        <div class="col-span-6 md:col-span-3">
                            <label class="field-label" data-field="age_months" [class.field-changed]="isChanged('age_months')" [class.remote-updated]="isRemoteUpdated('age_months')">เดือน@if (isRemoteUpdated('age_months')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-iconfield>
                                <p-inputnumber
                                    [(ngModel)]="form.age_months"
                                    (ngModelChange)="onAgeMonthsChanged()"
                                    [min]="0"
                                    [max]="11"
                                    [disabled]="form.age === null"
                                    [useGrouping]="false"
                                    placeholder="-"
                                    styleClass="w-full"
                                    inputStyleClass="w-full"
                                    [inputStyle]="ageInputStyle"
                                />
                                @if (form.age_months !== null) {
                                    <p-inputicon class="pi pi-times cursor-pointer" (click)="form.age_months = null; onAgeMonthsChanged()" />
                                }
                            </p-iconfield>
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'age_months' }" />
                        </div>
                        <div class="col-span-6 md:col-span-3">
                            <label class="field-label" data-field="age_days" [class.field-changed]="isChanged('age_days')" [class.remote-updated]="isRemoteUpdated('age_days')">วัน@if (isRemoteUpdated('age_days')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-iconfield>
                                <p-inputnumber
                                    [(ngModel)]="form.age_days"
                                    (ngModelChange)="onChanged()"
                                    [min]="0"
                                    [max]="30"
                                    [disabled]="form.age_months === null"
                                    [useGrouping]="false"
                                    placeholder="-"
                                    styleClass="w-full"
                                    inputStyleClass="w-full"
                                    [inputStyle]="ageInputStyle"
                                />
                                @if (form.age_days !== null) {
                                    <p-inputicon class="pi pi-times cursor-pointer" (click)="form.age_days = null; onChanged()" />
                                }
                            </p-iconfield>
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'age_days' }" />
                        </div>

                        <div class="col-span-12">
                            <label class="field-label required" data-field="chief_complaint" [class.field-changed]="isChanged('chief_complaint')" [class.remote-updated]="isRemoteUpdated('chief_complaint')">อาการสำคัญ / รายละเอียด@if (isRemoteUpdated('chief_complaint')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <textarea
                                pTextarea
                                [invalid]="isMissing('chief_complaint')"
                                class="w-full"
                                rows="4"
                                [(ngModel)]="form.chief_complaint"
                                (ngModelChange)="onChanged()"
                                placeholder="เช่น ผป.ติดเตียง บริเวณรอบบ้านน้ำท่วม"
                            ></textarea>
                            @if (isMissing('chief_complaint')) {
                                <p-message severity="error" size="small" variant="simple">กรุณาระบุอาการสำคัญ / รายละเอียด</p-message>
                            }
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'chief_complaint' }" />
                        </div>
                    </div>
                </div>

                <!-- Card 5 - what was done. Always open: it used to collapse
                     while taking a call, but an operator who cannot see the
                     fields does not know they exist, and there is nothing to
                     protect by hiding them. -->
                <div class="form-card">
                    <div class="form-card-title">การดำเนินการ</div>

                    <div class="grid grid-cols-12 gap-3">
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="ddpm_coordination" [class.field-changed]="isChanged('ddpm_coordination')" [class.remote-updated]="isRemoteUpdated('ddpm_coordination')">ประสานงานทีม ปภ.อำเภอ@if (isRemoteUpdated('ddpm_coordination')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-autocomplete
                                openBelow
                                #ddpmInput
                                (click)="openSuggestions($event, ddpmInput)"
                                (onClear)="onCleared(ddpmInput)"
                                [(ngModel)]="form.ddpm_coordination"
                                (ngModelChange)="onChanged()"
                                [suggestions]="ddpmSuggestions()"
                                (completeMethod)="ddpmSuggestions.set(suggest('ddpm', dataService.ddpmTeams(), $event.query))"
                                (onSelect)="onNamePicked('ddpm', $event.value)"
                                [group]="true"
                                [dropdown]="true"
                                [showClear]="true"
                                [showEmptyMessage]="false"
                                placeholder="เช่น ประสานกู้ชีพเต็กก่า"
                                styleClass="w-full"
                                inputStyleClass="thai-input"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'ddpm_coordination' }" />
                            <ng-container
                                *ngTemplateOutlet="shortcuts; context: { $implicit: dataService.ddpmShortcuts(), field: 'ddpm_coordination', input: ddpmInput }"
                            />
                        </div>
                        <div class="col-span-12 md:col-span-6">
                            <label class="field-label" data-field="operating_unit" [class.field-changed]="isChanged('operating_unit')" [class.remote-updated]="isRemoteUpdated('operating_unit')">หน่วยปฏิบัติ@if (isRemoteUpdated('operating_unit')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <!-- One list for every unit, so the same unit is
                                 not typed three different ways across one
                                 flood. -->
                            <p-autocomplete
                                openBelow
                                #unitInput
                                (click)="openSuggestions($event, unitInput)"
                                (onClear)="onCleared(unitInput)"
                                [(ngModel)]="form.operating_unit"
                                (ngModelChange)="onChanged()"
                                [suggestions]="unitSuggestions()"
                                (completeMethod)="unitSuggestions.set(suggest('unit', dataService.crews(), $event.query))"
                                (onSelect)="onNamePicked('unit', $event.value)"
                                [group]="true"
                                [dropdown]="true"
                                [showClear]="true"
                                [showEmptyMessage]="false"
                                placeholder="เช่น กู้ชีพเต็กก่า, อบต.ปากล่อ"
                                styleClass="w-full"
                                inputStyleClass="thai-input"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'operating_unit' }" />
                            <ng-container
                                *ngTemplateOutlet="shortcuts; context: { $implicit: dataService.crewShortcuts(), field: 'operating_unit', input: unitInput }"
                            />
                        </div>

                        <div class="col-span-12">
                            <label class="field-label" data-field="assistance" [class.field-changed]="isChanged('assistance')" [class.remote-updated]="isRemoteUpdated('assistance')">การช่วยเหลือ@if (isRemoteUpdated('assistance')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <textarea
                                pTextarea
                                class="w-full"
                                rows="3"
                                [(ngModel)]="form.assistance"
                                (ngModelChange)="onChanged()"
                            ></textarea>
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'assistance' }" />
                        </div>

                        <div class="col-span-12 md:col-span-4">
                            <label class="field-label" data-field="status" [class.field-changed]="isChanged('status')" [class.remote-updated]="isRemoteUpdated('status')">สำเร็จ@if (isRemoteUpdated('status')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <p-select
                                openBelow
                                [(ngModel)]="form.status"
                                (ngModelChange)="onChanged()"
                                [options]="dataService.lookups()?.statuses ?? []"
                                optionLabel="label"
                                optionValue="code"
                                styleClass="w-full"
                                appendTo="body"
                            />
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'status' }" />
                        </div>
                        <div class="hidden md:block md:col-span-8"></div>

                        <div class="col-span-12">
                            <label class="field-label" data-field="remarks" [class.field-changed]="isChanged('remarks')" [class.remote-updated]="isRemoteUpdated('remarks')">เพิ่มเติม@if (isRemoteUpdated('remarks')) {<span class="remote-note">อัปเดตโดยคนอื่น</span>}</label>
                            <textarea
                                pTextarea
                                class="w-full"
                                rows="3"
                                [(ngModel)]="form.remarks"
                                (ngModelChange)="onChanged()"
                            ></textarea>
                            <!-- Last field in the drawer: nothing below to float
                                 over, so its popover takes part in the layout and
                                 the form grows to fit it instead of the popover
                                 pressing on the bottom edge or covering the label. -->
                            <ng-container *ngTemplateOutlet="conflictCard; context: { $implicit: 'remarks', inflow: true }" />
                        </div>
                    </div>
                </div>
            }

            <div class="action-bar flex flex-wrap items-center gap-2 justify-end">
                <!-- Says what the dot on a label means, and only while one is
                     on screen: it appears together with the first dot. Same
                     class as the labels, so it is the same dot. -->
                @if (anyChanged()) {
                    <span class="field-changed changed-legend">= ช่องที่คุณแก้ไข</span>
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
                    [disabled]="showSkeleton()"
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

        <!-- The last few saves of this case, newest first, each as the
             fields it changed with the old and new text. Fetched on open
             every time: it is small, and the case may have been edited
             from another console since the drawer opened. -->
        <p-dialog
            header="ประวัติการแก้ไข"
            [visible]="historyOpen()"
            (visibleChange)="historyOpen.set($event)"
            [modal]="true"
            [dismissableMask]="true"
            [draggable]="false"
            [style]="{ width: '32rem' }"
            [breakpoints]="{ '640px': '94vw' }"
            appendTo="body"
        >
            <!-- One size whatever is in it - skeleton, nothing, or ten
                 saves - so the dialog never re-centres; a long history
                 scrolls inside. The list fades in so the swap reads as
                 content arriving rather than a flicker. -->
            <div class="history-body">
                @if (historyLoading()) {
                    <!-- Enough placeholder saves to fill the fixed body,
                         laid out with the list's own classes so the bars
                         sit where the lines will; whatever runs past the
                         bottom is clipped rather than scrolled. -->
                    <div class="history-skeleton" aria-busy="true">
                        @for (lines of HISTORY_SKELETON; track $index) {
                            <div class="history-entry">
                                <div class="history-when"><p-skeleton width="9rem" height="0.8rem" /></div>
                                @for (line of lines; track $index) {
                                    <div class="history-change"><p-skeleton height="1.1rem" /></div>
                                }
                            </div>
                        }
                    </div>
                } @else if (historyError()) {
                    <div class="history-loaded flex items-center justify-between gap-3">
                        <span>โหลดประวัติไม่สำเร็จ</span>
                        <button pButton type="button" label="ลองใหม่" class="p-button-text p-button-sm" (click)="loadHistory()"></button>
                    </div>
                } @else if (history().length === 0) {
                    <div class="history-loaded text-surface-500">ยังไม่มีการแก้ไขหลังบันทึกครั้งแรก</div>
                } @else {
                    <div class="history-loaded">
                        @for (entry of history(); track entry.at) {
                            <div class="history-entry">
                                <div class="history-when">{{ formatHistoryTime(entry.at) }}</div>
                                @for (change of entry.lines; track change.label) {
                                    <div class="history-change">
                                        <span class="history-label">{{ change.label }}</span>
                                        @if (change.segments; as segments) {
                                            <!-- Mostly the same text: one line, with only
                                                 what went and what came marked. -->
                                            <span class="history-diff">
                                                @for (seg of segments; track $index) {
                                                    @switch (seg.kind) {
                                                        @case ('del') {
                                                            <del class="history-from">{{ seg.text }}</del>
                                                        }
                                                        @case ('ins') {
                                                            <ins class="history-ins">{{ seg.text }}</ins>
                                                        }
                                                        @default {
                                                            <span>{{ seg.text }}</span>
                                                        }
                                                    }
                                                }
                                            </span>
                                        } @else {
                                            <span class="history-from">{{ change.from }}</span>
                                            <i class="pi pi-arrow-right history-arrow" aria-hidden="true"></i>
                                            <span class="history-to">{{ change.to }}</span>
                                        }
                                    </div>
                                }
                            </div>
                        }
                    </div>
                }
            </div>
        </p-dialog>

        <!-- Badges under a free-text field. Mostly prefixes - "อบต." is
             clicked and the tambon typed after it - so a click also puts the
             caret at the end of the field.

             tabindex="-1" deliberately. These are a saving for the mouse; a
             keyboard user simply types the word. Leaving them in the tab
             sequence put five stops between "ผู้แจ้ง" and the phone number,
             which is five presses per call on the one path that has to be
             fastest. -->
        <!-- Somebody else saved a field this operator has also changed
             and not saved. Fields only one of them touched merge on their
             own (see mergeRemote); this is the one case that needs a
             decision, and it is put to the operator rather than guessed.
             Shown as a popover under the field in question, anchored in the
             field's column (see .conflict-popover); it stays until a choice
             is made. -->
        <ng-template #conflictCard let-field let-inflow="inflow">
            @if (conflictFor(field); as theirs) {
                <div class="conflict-popover text-sm" [class.conflict-popover-inflow]="inflow">
                    <!-- A cleared field has no value to point at, so it says
                         what was done instead of showing "(ว่าง)". -->
                    @if (conflictCleared(field)) {
                        <div class="font-semibold mb-2">คนอื่นลบค่าในช่องนี้ออก</div>
                    } @else {
                        <div class="font-semibold mb-1">คนอื่นบันทึกค่านี้ไว้:</div>
                        <div class="mb-2 whitespace-pre-wrap break-words">{{ theirs }}</div>
                    }
                    <div class="flex gap-2 justify-end">
                        <button pButton type="button" label="เก็บค่าของฉัน" size="small" [text]="true" severity="warn" (click)="keepMine(field)"></button>
                        <button pButton type="button" [label]="conflictCleared(field) ? 'ลบออก' : 'ใช้ค่านี้'" size="small" severity="warn" (click)="useTheirs(field)"></button>
                    </div>
                </div>
            }
        </ng-template>
        <ng-template #shortcuts let-list let-field="field" let-input="input" let-disabled="disabled">
            <div class="flex flex-wrap gap-1 mt-1.5">
                @for (shortcut of list; track shortcut) {
                    <button
                        pButton
                        type="button"
                        tabindex="-1"
                        [label]="shortcut"
                        class="p-button-sm p-button-outlined py-0.5 px-2"
                        [disabled]="disabled"
                        (click)="applyShortcut(field, shortcut, input)"
                    ></button>
                }
            </div>
        </ng-template>
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

    private readonly agentSelect = viewChild<Select>('agentSelect');
    private readonly drawer = viewChild(Drawer);
    // Every field with a body-appended panel, so the panels can be closed
    // before the drawer that owns them goes - see teardown().
    private readonly selects = viewChildren(Select);
    private readonly autocompletes = viewChildren(AutoComplete);
    private readonly datepickers = viewChildren(DatePicker);

    form: FormModel = emptyForm();

    readonly saving = signal(false);
    readonly dirty = signal(false);
    readonly loaded = signal<FloodCase | null>(null);
    // True only while an edit is being fetched with no copy in hand to show
    // meanwhile; see initialise().
    readonly loadingCase = signal(false);
    // Whether this opening of the drawer has already placed focus; see the
    // effect in the constructor.
    private focusedOnOpen = false;
    /**
     * The skeleton covers both waits. A new case has nothing to fetch, but
     * every dropdown in it is empty until the lookups land - on a cold page
     * (a link straight to ?case=new) that is the same blank-then-filled
     * jump an edit had, so it waits here too.
     */
    readonly showSkeleton = computed(() => this.open() && (this.loadingCase() || this.dataService.lookupsPending()));

    // Placeholder saves for the history dialog: enough to fill its body,
    // alternating two changed lines and one, as real histories tend to.
    readonly HISTORY_SKELETON: readonly (readonly number[])[] = [[1, 2], [1], [1, 2], [1], [1, 2], [1]];
    readonly historyOpen = signal(false);
    readonly historyLoading = signal(false);
    readonly historyError = signal(false);
    readonly history = signal<HistoryView[]>([]);

    // "5 นาทีที่แล้ว" has to keep up with the clock: this drawer stays open
    // for the length of a call. Cheap enough at half a minute, and the
    // interval only runs while the page is alive.
    private readonly nowTick = signal(Date.now());
    readonly lastEdited = computed(() => {
        const updatedAt = this.loaded()?.updated_at;
        return updatedAt && !this.isNew() ? formatLastEdited(updatedAt, this.nowTick()) : '';
    });
    readonly SKELETON_CARDS = SKELETON_CARDS;
    readonly skeletonHeight = skeletonHeight;

    shortcutsFor(kind: NonNullable<SkeletonField['shortcuts']>): string[] {
        switch (kind) {
            case 'reporter':
                return this.dataService.reporterShortcuts();
            case 'ddpm':
                return this.dataService.ddpmShortcuts();
            case 'crew':
                return this.dataService.crewShortcuts();
        }
    }
    // The case as last loaded or saved, field by field. A field is "mine"
    // while it differs from this; everything else is fair game for a save
    // by someone else to update under the operator's eyes.
    private baseline: FormModel | null = null;
    // Fields both sides changed since the baseline, with the other side's
    // value. Cleared by the operator choosing, one way or the other.
    readonly conflicts = signal<Partial<Record<FormField, unknown>>>({});
    // Fields someone else's save just changed under the operator, marked on
    // the field itself for a few seconds: the value changes where they are
    // looking, so the reason should show there too, not only in a toast
    // across the screen.
    readonly remoteUpdated = signal<ReadonlySet<FormField>>(new Set());
    private remoteUpdatedTimers = new Map<FormField, ReturnType<typeof setTimeout>>();
    // Whether a save has been attempted on this form. Required fields turn
    // red only after that: a form that opens red on every empty field during
    // a live call is noise, not help.
    readonly submitted = signal(false);
    readonly duplicates = signal<FloodDuplicate[]>([]);
    readonly duplicateWindow = signal(6);
    // Grouped like the agent dropdown: this console's last few on top,
    // every name underneath.
    readonly reporterSuggestions = signal<OptionGroup<string>[]>([]);
    readonly ddpmSuggestions = signal<OptionGroup<string>[]>([]);
    readonly unitSuggestions = signal<OptionGroup<string>[]>([]);

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
    // What the old "อัตโนมัติ" option used to be, without costing a fourth
    // entry in the list: while this is true the shift tracks the report time,
    // and picking a shift by hand turns it off for the rest of the drawer.
    private readonly shiftFollowsTime = signal(true);

    readonly agentGroups = computed(() =>
        groupByRecent<FloodAgent>(this.dataService.agents(), this.drafts.recentOf('agent'), (a) => a.agent_id)
    );

    readonly districtGroups = computed(() =>
        groupByRecent(this.dataService.districtOptions(), this.drafts.recentOf('district'), (o) => o.value)
    );

    // Grouped by amphoe rather than under one "ทั้งหมด": with no amphoe
    // chosen the whole province is listed, and the amphoe header is the only
    // thing telling two tambon of the same name apart.
    readonly subdistrictGroups = computed(() =>
        prependRecent(this.dataService.subdistrictGroupsFor(this.districtCodeSignal()), this.drafts.recentOf('subdistrict'), (o) => o.value)
    );

    // Only when the operator actually pasted coordinates or a maps link -
    // the column is called "พิกัด" but almost every real value is a landmark,
    // so this is an opportunistic extra, never a validation rule.
    readonly mapLink = computed(() => {
        const note = this.locationNoteSignal().trim();
        if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(note)) return note;
        const coords = /^(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})$/.exec(note);
        return coords ? `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[2]}` : null;
    });

    private duplicateTimer: ReturnType<typeof setTimeout> | null = null;
    private lastInitialised: string | null = null;

    private readonly updates = inject(AppUpdateService);

    constructor() {
        // The update banner asks before it reloads: nothing is kept between
        // loads, so a reload mid-call is the whole call typed again while
        // somebody is still on the line.
        const destroyRef = inject(DestroyRef);
        destroyRef.onDestroy(
            this.updates.addReloadBlocker(() => (this.hasUnsavedChanges() ? 'กำลังกรอกเคสที่ยังไม่ได้บันทึก' : null))
        );
        // Leaving the page altogether with a panel open - same orphan as
        // Back, without the effect below getting a turn.
        destroyRef.onDestroy(() => this.closeOverlays());

        const tick = setInterval(() => this.nowTick.set(Date.now()), 30_000);
        destroyRef.onDestroy(() => clearInterval(tick));

        // Every save anywhere wakes the page's stream; while a saved case is
        // open here, that is the cue to look at it again and fold in what
        // someone else wrote.
        effect(() => {
            this.dataService.snapshot();
            untracked(() => this.pullRemoteChanges());
        });

        // A new case opened before the lookups landed waits behind the
        // skeleton, so the drawer's own onShow came and went with no agent
        // select on screen to focus. Take the first chance after it appears.
        effect(() => {
            const waiting = this.showSkeleton();
            if (waiting || !this.isNew()) return;
            untracked(() => this.focusAgent());
        });

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
        this.submitted.set(false);
        this.dirty.set(false);
        this.conflicts.set({});
        this.clearRemoteUpdated();
        this.baseline = null;

        if (id === 'new') {
            this.loaded.set(null);
            this.shiftFollowsTime.set(true);
            this.form = emptyForm();
            this.syncDerived();
            // The pre-filled form is the baseline, so "did anything change"
            // asks the same question for a new case as for an edit.
            this.baseline = { ...this.form };
        } else {
            // An edit is almost always opened from a row of the list, and
            // that row is the whole case. Showing it at once is what keeps
            // the drawer from sliding in blank and filling itself a moment
            // later; the fetch below then only has to catch a row that went
            // stale between the list being drawn and the click.
            const seed = this.dataService.cases().find((c) => c.case_id === id) ?? null;
            if (seed) this.adopt(seed);
            this.loadingCase.set(!seed);
            this.api.getCase(id).subscribe({
                next: ({ case: found }) => {
                    // The drawer may have closed, or moved on to another
                    // case, while this was in flight.
                    if (this.caseId() !== id) return;
                    this.loadingCase.set(false);
                    if (!seed) this.adopt(found);
                    // Same data: nothing to do, and nothing visible happens.
                    // Newer on the server: the ordinary merge, which keeps
                    // whatever the operator has typed in the meantime.
                    else if (found.updated_at !== seed.updated_at) this.mergeRemote(found);
                },
                error: () => {
                    if (this.caseId() !== id) return;
                    this.loadingCase.set(false);
                    // Seeded from a row, the form is still usable; the next
                    // save or wake will fetch again. Nothing to show
                    // otherwise, so the drawer closes.
                    if (seed) return;
                    this.messageService.add({ severity: 'error', summary: 'ไม่พบเคสนี้', life: 4000 });
                    this.closed.emit();
                }
            });
        }
    }

    // --- history ------------------------------------------------------------

    openHistory(): void {
        this.historyOpen.set(true);
        this.loadHistory();
    }

    loadHistory(): void {
        const id = this.caseId();
        if (!id || id === 'new') return;
        this.historyLoading.set(true);
        this.historyError.set(false);
        this.api.getCaseHistory(id).subscribe({
            next: ({ history }) => {
                // The drawer may have moved on while this was in flight.
                if (this.caseId() !== id) return;
                this.history.set(history.map((entry) => this.toHistoryView(entry)));
                this.historyLoading.set(false);
            },
            error: () => {
                if (this.caseId() !== id) return;
                this.historyLoading.set(false);
                this.historyError.set(true);
            }
        });
    }

    readonly formatHistoryTime = formatHistoryTime;

    /** Display text for every line, and the diff worked out once, here, not on each render. */
    private toHistoryView(entry: FloodHistoryEntry): HistoryView {
        return {
            at: entry.at,
            lines: entry.changes.map((change) => {
                const from = this.formatHistoryValue(change.field, change.from);
                const to = this.formatHistoryValue(change.field, change.to);
                // Only free text is worth aligning: a label picked from a
                // list (a status, a crew, a tambon) is one thing or another.
                const segments = FREE_TEXT_HISTORY_FIELDS.has(change.field) ? diffText(change.from, change.to) : null;
                return { label: change.label, from, to, segments };
            })
        };
    }

    /** A stored value as the dialog prints it: the date in Thai, a blank as a dash. */
    private formatHistoryValue(field: string, value: string): string {
        if (!value) return '—';
        if (field === 'date') {
            const date = parseIsoDate(value);
            return `${date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })} ${twoDigitBuddhistYear(date)}`;
        }
        return value;
    }

    /** Make a stored case the form and its baseline. */
    private adopt(found: FloodCase): void {
        this.loaded.set(found);
        // A saved case already has a shift somebody stands behind;
        // correcting its time must not quietly move it.
        this.shiftFollowsTime.set(false);
        this.form = this.toForm(found);
        this.baseline = this.toForm(found);
        this.syncDerived();
    }

    onShown(): void {
        // A new case: date, time and shift are already filled in by the
        // system, so focus starts on the first blank field, the agent. A
        // select rather than a text box, so on a phone this highlights the
        // field without raising the keyboard.
        //
        // An edit: nothing. Which field the operator came to change is
        // anyone's guess, and a focus they did not ask for either scrolls
        // the form or pops a keyboard over it.
        if (!this.isNew()) return;
        // Behind the skeleton there is no select yet; the effect in the
        // constructor focuses it when the real form appears.
        if (this.showSkeleton()) return;
        this.focusAgent();
    }

    /** Once per opening, whether the drawer's onShow or the effect gets there first. */
    private focusAgent(): void {
        if (this.focusedOnOpen) return;
        this.focusedOnOpen = true;
        setTimeout(() => this.agentSelect()?.focusInputViewChild?.nativeElement?.focus(), 60);
    }

    private teardown(): void {
        this.loadingCase.set(false);
        this.clearRemoteUpdated();
        this.focusedOnOpen = false;
        this.historyOpen.set(false);
        this.history.set([]);
        // Close any open dropdown first. The panels are appended to <body>,
        // outside the drawer, so the drawer sliding away does not take them
        // with it: leave one open and use the browser's Back while the
        // drawer is up, and the panel stays on screen over the table with
        // nothing behind it - and the first click outside it left the page
        // dead until a reload. Hiding them here, while their owners are
        // still alive, lets each one leave the normal way.
        this.closeOverlays();
        // Close through the drawer's own close(), the path its × button
        // takes, rather than only letting [visible] go false. The difference
        // is when the mask goes: close() starts the mask's fade at once, so
        // it leaves alongside the slide-out and the page is unlocked as soon
        // as the drawer is gone; the [visible] path keeps the mask solid for
        // the whole slide and fades it afterwards, which reads as the page
        // staying locked for most of a second after it was closed.
        // (primefaces/primeng#19498 is this exact inconsistency.)
        this.drawer()?.close(new Event('close'));
        // PrimeNG removes the mask on the animationend of that fade, and
        // only then. If the event never arrives, the mask stays: transparent,
        // fixed, full-screen, above everything, and the whole page is dead
        // until a reload (primefaces/primeng#19460, #19214). So once the
        // slide-out has had ample time, a mask that is still there is torn
        // down through PrimeNG's own routine, which also unlocks the scroll.
        setTimeout(() => {
            const drawer = this.drawer();
            if (drawer?.mask && !this.open()) drawer.destroyModal();
        }, MASK_TEARDOWN_GRACE_MS);
        if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
        this.duplicateTimer = null;
        this.duplicates.set([]);
        this.dirty.set(false);
    }

    private closeOverlays(): void {
        for (const select of this.selects()) if (select.overlayVisible) select.hide();
        for (const autocomplete of this.autocompletes()) if (autocomplete.overlayVisible) autocomplete.hide();
        for (const datepicker of this.datepickers()) if (datepicker.overlayVisible) datepicker.hideOverlay();
    }

    // --- editing ------------------------------------------------------------

    /** Refresh the signal mirrors of the form fields other state derives from. */
    private syncDerived(): void {
        this.districtCodeSignal.set(this.form.district_code);
        this.locationNoteSignal.set(this.form.location_note ?? '');
    }

    onTimeChanged(): void {
        // Retype the time and the shift follows it - unless the operator has
        // already overridden the shift, in which case their choice stands.
        if (this.shiftFollowsTime()) {
            this.form.shift = shiftForTime(this.form.reported_time);
        }
        this.onChanged();
    }

    onShiftChanged(): void {
        this.shiftFollowsTime.set(false);
        this.onChanged();
    }

    onChanged(): void {
        this.dirty.set(true);
    }

    onAgentChanged(): void {
        // Recorded on the pick, not on save: the operator who clears the field
        // or abandons the call still picked that name, and the list is only a
        // shortcut - nothing downstream reads it.
        if (this.form.agent_id) this.drafts.remember('agent', this.form.agent_id);
        this.onChanged();
    }

    /** Suggestions for a free-text field: every name on an empty query (the dropdown button), otherwise a substring match. */
    matching(all: string[], query: string): string[] {
        const needle = (query ?? '').trim().toLowerCase();
        return needle ? all.filter((name) => name.toLowerCase().includes(needle)) : [...all];
    }

    /**
     * The same, sectioned like the agent dropdown: "ใช้ล่าสุด" on top,
     * "ทั้งหมด" underneath. Recents are taken from the matches, so typing
     * narrows both sections together. No match means no groups at all -
     * a lone "ทั้งหมด" header over nothing would read as an empty list,
     * and these fields deliberately show nothing when there is nothing.
     */
    suggest(kind: 'reporter' | 'ddpm' | 'unit', all: string[], query: string): OptionGroup<string>[] {
        const matches = this.matching(all, query);
        return matches.length ? groupByRecent(matches, this.drafts.recentOf(kind), (name) => name) : [];
    }

    /** A pick from the list counts at once, as it does for the agent. */
    onNamePicked(kind: 'reporter' | 'ddpm' | 'unit', value: string): void {
        this.drafts.remember(kind, value);
    }

    /**
     * The free-text fields keep their shortlist from what is saved as well,
     * not only what is picked: a badge plus a typed tail never goes through
     * the list, and what was saved is what the next call wants on top. A
     * value not in the list is kept too - harmless, it just never shows.
     */
    private rememberNames(payload: FloodCaseInput): void {
        if (payload.reporter) this.drafts.remember('reporter', payload.reporter);
        if (payload.ddpm_coordination) this.drafts.remember('ddpm', payload.ddpm_coordination);
        if (payload.operating_unit) this.drafts.remember('unit', payload.operating_unit);
    }

    /**
     * A click on the text box opens the list for whatever is in it - the
     * full list when empty - the way the ▼ button does. Out of the box the
     * component only opens on typing, so a field holding "อบต." from a badge
     * or a loaded case sat there closed until a character was typed and deleted.
     * The click is on the host, so anything that is not the text box itself
     * (the ▼ button, which toggles on its own) is left alone.
     */
    openSuggestions(event: MouseEvent, input: AutoComplete): void {
        const el = input.inputEL?.nativeElement as HTMLInputElement | undefined;
        if (!el || event.target !== el || input.overlayVisible) return;
        input.search(event, el.value ?? '', 'click');
    }

    /**
     * The × clears the text but leaves the list as it was - still showing
     * what the cleared text matched, "No results found" included. Re-run the
     * blank search so the full list is back, and put the caret in the box,
     * since clearing is the first half of choosing again.
     */
    onCleared(input: AutoComplete): void {
        input.inputEL?.nativeElement?.focus();
        input.search(null, '', 'clear');
    }

    applyShortcut(field: 'reporter' | 'ddpm_coordination' | 'operating_unit', value: string, input: AutoComplete): void {
        this.form[field] = value;
        this.onChanged();
        // After ngModel has written the value, or the caret would land in
        // the old text.
        setTimeout(() => {
            const el = input.inputEL?.nativeElement as HTMLInputElement | undefined;
            if (!el) return;
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
            // Open the suggestions for the prefix just inserted, as if it had
            // been typed. The panel only opens from the component's own
            // search, which an `input` event triggers and a model write does
            // not - so without this the operator had to type a character and
            // delete it before "อบต." offered the tambons that start with it.
            input.search(null, value, 'input');
        });
    }

    // PrimeNG's own InputNumber clear button hides itself when the value is
    // 0, and 0 is a real answer in every one of the age boxes - a newborn is
    // 0 / 0 / 5 - so they get an icon-field × instead. That × sits outside
    // the component, so the room for it is made here the way PrimeNG's own
    // styles do for theirs.
    readonly ageInputStyle = { paddingInlineEnd: 'calc(var(--p-form-field-padding-x) * 2 + var(--p-icon-size))' };

    onAgeChanged(): void {
        // Months cannot outlive the years they belong to, nor days the months.
        if (this.form.age === null) this.form.age_months = null;
        this.onAgeMonthsChanged();
    }

    onAgeMonthsChanged(): void {
        if (this.form.age_months === null) this.form.age_days = null;
        this.onChanged();
    }

    // Takes the value because the phone box cannot use [(ngModel)]: the
    // key filter directive on it declares its own ngModelChange, and the
    // banana-box refuses two targets. Its type is string | number for the
    // same reason.
    onPhoneChanged(value?: string | number): void {
        if (value !== undefined) this.form.phone = String(value ?? '');
        this.onChanged();
        this.scheduleDuplicateCheck();
    }

    onLocationChanged(): void {
        this.locationNoteSignal.set(this.form.location_note ?? '');
        this.onChanged();
        this.scheduleDuplicateCheck();
    }

    onSubdistrictChanged(): void {
        const code = this.form.subdistrict_code;
        if (code) {
            this.drafts.remember('subdistrict', code);
            // The caller names the tambon far more often than the amphoe, so
            // the amphoe is derived from it rather than demanded first. Every
            // tambon carries its amphoe, which is what makes this safe: the
            // pair can only be the one on the tambon's own record.
            const subdistrict = this.dataService.subdistrictByCode(code);
            if (subdistrict && subdistrict.district_code !== this.form.district_code) {
                this.form.district_code = subdistrict.district_code;
                this.drafts.remember('district', subdistrict.district_code);
                this.districtCodeSignal.set(subdistrict.district_code);
            }
        }
        this.onChanged();
        // The tambon is half of what the duplicate check matches on.
        this.scheduleDuplicateCheck();
    }

    onDistrictChanged(districtCode: string | null): void {
        if (districtCode) this.drafts.remember('district', districtCode);
        // Clearing the tambon is the point of the dependency: keeping the old
        // one would leave a pair from two different amphoe on screen. Only an
        // amphoe the operator picked does this - one filled in from a tambon
        // must obviously not clear the tambon that filled it.
        this.form.subdistrict_code = null;
        this.districtCodeSignal.set(districtCode);
        this.onChanged();
        this.scheduleDuplicateCheck();
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

    // --- other people's edits -----------------------------------------------

    /**
     * Something a save would actually send. `dirty` alone only says a field
     * was touched: typing a letter and deleting it again leaves the form as
     * it was, and no exit should ask about that.
     */
    private hasUnsavedChanges(): boolean {
        return this.dirty() && this.changedFields().length > 0;
    }

    /**
     * Whether this operator has changed a field of a saved case - marked on
     * its label, so a value changed by accident (a mouse wheel over a
     * dropdown, the wrong amphoe) is seen before the save, not after. Not on
     * a new case, where every filled field would be marked. What others
     * saved in the meantime has moved the baseline, so only this operator's
     * own changes show.
     */
    isChanged(field: FormField): boolean {
        const baseline = this.baseline;
        return !this.isNew() && !!baseline && !sameValue(field, this.form[field], baseline[field]);
    }

    /** Whether any label carries the changed dot - when its legend shows. */
    anyChanged(): boolean {
        return FORM_FIELDS.some((field) => this.isChanged(field));
    }

    /** Form fields that differ from the baseline - what a save will send. */
    private changedFields(): FormField[] {
        const baseline = this.baseline;
        if (!baseline) return FORM_FIELDS;
        return FORM_FIELDS.filter((field) => !sameValue(field, this.form[field], baseline[field]));
    }

    private pullRemoteChanges(): void {
        const id = this.caseId();
        if (!id || id === 'new' || !this.loaded() || this.saving()) return;
        this.api.getCase(id).subscribe({
            next: ({ case: fresh }) => {
                if (fresh.updated_at === this.loaded()?.updated_at) return;
                this.mergeRemote(fresh);
            },
            // A missed refresh costs nothing: the next save's response, or
            // the next wake, brings the same data.
            error: () => undefined
        });
    }

    /**
     * Fold a newer copy of the open case into the form, field by field.
     * A field nobody here touched takes the incoming value; a field this
     * operator changed keeps their typing, and if the incoming value differs
     * from that too it is raised as a conflict for them to settle. Either
     * way the baseline moves to what is now stored, so the next save sends
     * exactly the fields still different from it.
     */
    private mergeRemote(fresh: FloodCase): void {
        const baseline = this.baseline;
        if (!baseline) return;
        // Whatever arrived is also the newest line of the history.
        if (this.historyOpen()) this.loadHistory();
        const incoming = this.toForm(fresh);
        const conflicts = { ...this.conflicts() };
        const applied: FormField[] = [];
        for (const field of FORM_FIELDS) {
            if (sameValue(field, incoming[field], baseline[field])) continue;
            const mineIsClean = sameValue(field, this.form[field], baseline[field]);
            if (mineIsClean) {
                (this.form as Record<FormField, unknown>)[field] = incoming[field];
                applied.push(field);
            } else if (!sameValue(field, this.form[field], incoming[field])) {
                conflicts[field] = incoming[field];
            }
            (baseline as Record<FormField, unknown>)[field] = incoming[field];
        }
        this.loaded.set(fresh);
        const raised = Object.keys(conflicts).length - Object.keys(this.conflicts()).length;
        this.conflicts.set(conflicts);
        this.syncDerived();
        // The popover sits under the field, but a toast says why it appeared.
        if (raised > 0) {
            this.messageService.add({ severity: 'warn', summary: 'คนอื่นแก้ไขช่องที่คุณกำลังแก้อยู่', detail: 'เลือกค่าที่จะเก็บใต้ช่องนั้น', life: 5000 });
            this.scrollToFirstConflict();
        }
        if (applied.length) {
            this.markRemoteUpdated(applied);
            this.messageService.add({ severity: 'info', summary: 'มีการอัปเดตจากคนอื่น', detail: `${applied.length} ช่องถูกอัปเดตแล้ว`, life: 3000 });
        }
    }

    /** Whether someone else's save changed this field a moment ago. */
    isRemoteUpdated(field: FormField): boolean {
        return this.remoteUpdated().has(field);
    }

    // As long as the note's fade (.remote-note); each field keeps its own
    // timer, so a second update restarts that field's time.
    private static readonly REMOTE_MARK_MS = 3000;

    private markRemoteUpdated(fields: FormField[]): void {
        const next = new Set(this.remoteUpdated());
        for (const field of fields) {
            next.add(field);
            clearTimeout(this.remoteUpdatedTimers.get(field));
            this.remoteUpdatedTimers.set(
                field,
                setTimeout(() => {
                    this.remoteUpdatedTimers.delete(field);
                    const rest = new Set(this.remoteUpdated());
                    rest.delete(field);
                    this.remoteUpdated.set(rest);
                }, FloodCaseFormDrawer.REMOTE_MARK_MS)
            );
        }
        this.remoteUpdated.set(next);
    }

    private clearRemoteUpdated(): void {
        for (const timer of this.remoteUpdatedTimers.values()) clearTimeout(timer);
        this.remoteUpdatedTimers.clear();
        this.remoteUpdated.set(new Set());
    }

    /** The other side's value for a conflicted field, readable, or null. */
    conflictFor(field: FormField): string | null {
        const theirs = this.conflicts()[field];
        return theirs === undefined ? null : this.describe(field, theirs);
    }

    /** Whether the other side's value for a conflicted field is empty. */
    conflictCleared(field: FormField): boolean {
        const theirs = this.conflicts()[field];
        return theirs === null || theirs === '';
    }

    /** Bring the first unsettled conflict into view once it is rendered. */
    private scrollToFirstConflict(): void {
        setTimeout(() => document.querySelector('.flood-drawer .conflict-popover')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }

    useTheirs(field: FormField): void {
        (this.form as Record<FormField, unknown>)[field] = this.conflicts()[field];
        this.keepMine(field);
        this.syncDerived();
    }

    keepMine(field: FormField): void {
        const rest = { ...this.conflicts() };
        delete rest[field];
        this.conflicts.set(rest);
    }

    /** A field's value as the operator would read it, for the conflict panel. */
    private describe(field: FormField, value: unknown): string {
        if (value === null || value === undefined || value === '') return '(ว่าง)';
        if (value instanceof Date) {
            return field === 'reported_time'
                ? value.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                : value.toLocaleDateString('th-TH');
        }
        const lookups = this.dataService;
        switch (field) {
            case 'agent_id':
                return lookups.agents().find((a) => a.agent_id === value)?.agent_name ?? String(value);
            case 'channel_id':
                return lookups.channels().find((c) => c.channel_id === value)?.channel_name ?? String(value);
            case 'district_code':
                return lookups.districtByCode(String(value))?.district_name ?? String(value);
            case 'subdistrict_code':
                return lookups.subdistrictByCode(String(value))?.subdistrict_name ?? String(value);
            case 'gender':
                return lookups.genders().find((g) => g.code === value)?.label ?? String(value);
            case 'shift':
                return lookups.shifts().find((s) => s.code === value)?.label ?? String(value);
            case 'status':
                return (lookups.lookups()?.statuses ?? []).find((s) => s.code === value)?.label ?? String(value);
            default:
                return String(value);
        }
    }

    // --- saving -------------------------------------------------------------

    private toForm(item: FloodCase): FormModel {
        const at = new Date(item.reported_at);
        return {
            reported_date: at,
            reported_time: at,
            // Every saved case has a concrete shift; a record written before
            // the field existed falls back to its own report time.
            shift: item.shift || shiftForTime(at),
            agent_id: item.agent_id || null,
            channel_id: item.channel_id ?? null,
            reporter: item.reporter ?? '',
            phone: item.phone_display ?? '',
            district_code: item.district_code || null,
            subdistrict_code: item.subdistrict_code || null,
            location_note: item.location_note ?? '',
            gender: item.gender || null,
            age: item.age,
            age_months: item.age_months ?? null,
            age_days: item.age_days ?? null,
            chief_complaint: item.chief_complaint ?? '',
            ddpm_coordination: item.ddpm_coordination ?? '',
            operating_unit: item.operating_unit ?? '',
            status: item.status ?? 'pending',
            assistance: item.assistance ?? '',
            remarks: item.remarks ?? ''
        };
    }

    private static readonly REQUIRED: readonly RequiredField[] = ['district_code', 'subdistrict_code', 'location_note', 'chief_complaint'];

    /** Whether a required field is still empty - only once a save has been tried. */
    isMissing(field: RequiredField): boolean {
        if (!this.submitted()) return false;
        const value = this.form[field];
        return !(typeof value === 'string' ? value.trim() : value);
    }

    private toPayload(): FloodCaseInput | null {
        this.submitted.set(true);
        if (FloodCaseFormDrawer.REQUIRED.some((field) => this.isMissing(field))) {
            this.messageService.add({
                severity: 'warn',
                summary: 'กรอกข้อมูลไม่ครบ',
                detail: 'ต้องระบุ อำเภอ ตำบล พิกัด และอาการสำคัญ',
                life: 4000
            });
            // The toast says what; the red border says where - but only if it
            // is on screen, and in a drawer this long it often is not.
            setTimeout(() => document.querySelector('.flood-drawer .p-invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            return null;
        }
        return payloadOf(this.form);
    }

    /**
     * The request fields of the form fields that changed - what an edit
     * sends - with the baseline's values for the same fields, so the server
     * can refuse to write over a change it has had since.
     */
    private toPatch(full: FloodCaseInput): FloodCasePatch {
        const keys = new Set(this.changedFields().flatMap((field) => PAYLOAD_FIELDS[field]));
        const started = this.baseline ? payloadOf(this.baseline) : null;
        const patch: FloodCasePatch = {};
        const base: Partial<FloodCaseInput> = {};
        for (const key of keys) {
            (patch as Record<string, unknown>)[key] = full[key];
            if (started) (base as Record<string, unknown>)[key] = started[key];
        }
        if (started && keys.size) patch.base = base;
        return patch;
    }

    save(andNext: boolean, retried = false): void {
        // An open conflict is a question the operator has not answered yet;
        // saving past it would write their value over the other one unseen.
        if (Object.keys(this.conflicts()).length) {
            this.messageService.add({ severity: 'warn', summary: 'ยังมีช่องที่ถูกแก้ไขพร้อมกัน', detail: 'เลือกค่าที่จะเก็บก่อนบันทึก', life: 4000 });
            this.scrollToFirstConflict();
            return;
        }
        const payload = this.toPayload();
        if (!payload) return;
        const key = this.caseId() ?? 'new';

        const patch = this.isNew() ? null : this.toPatch(payload);
        if (patch && Object.keys(patch).length === 0) {
            // Nothing of this operator's to write; whatever changed came from
            // someone else and is already in the form. Said, not just closed:
            // a drawer that vanishes without a word leaves the operator
            // reopening the case to see whether it saved.
            this.messageService.add({ severity: 'info', summary: 'ไม่มีการเปลี่ยนแปลง', life: 2500 });
            this.dirty.set(false);
            this.submitted.set(false);
            this.closed.emit();
            return;
        }
        this.saving.set(true);
        this.rememberNames(payload);

        const request = patch ? this.api.updateCase(key, patch) : this.api.createCase(payload);

        request.subscribe({
            next: ({ case: saved }) => {
                this.saving.set(false);
                this.dirty.set(false);
                this.submitted.set(false);
                if (!this.isNew()) {
                    // Adopt the stored copy as the new baseline, so the next
                    // save sends only what changes from here on.
                    this.loaded.set(saved);
                    this.baseline = this.toForm(saved);
                    this.form = this.toForm(saved);
                    this.syncDerived();
                }
                this.savedCase.emit(saved);
                this.messageService.add({
                    severity: 'success',
                    summary: 'บันทึกแล้ว',
                    life: 2500
                });

                if (andNext) {
                    // Clears and re-focuses without closing: during a bad
                    // night the calls arrive back to back.
                    this.form = emptyForm();
                    this.syncDerived();
                    this.baseline = { ...this.form };
                    this.duplicates.set([]);
                    this.onShown();
                } else {
                    this.closed.emit();
                }
            },
            error: (err) => {
                this.saving.set(false);
                // Someone else changed a field this save also changes, and it
                // reached the server first. Their copy comes back with the
                // refusal; the ordinary merge puts the clash under its field.
                // A 409 that leaves nothing to ask - a write that landed just
                // after the check, on a field the form cannot show - has still
                // moved the baseline on, so the save is simply sent again, once.
                const stored: FloodCase | undefined = err?.status === 409 ? err.error?.detail?.case : undefined;
                if (stored) {
                    this.mergeRemote(stored);
                    if (Object.keys(this.conflicts()).length) return;
                    if (!retried) return this.save(andNext, true);
                    this.messageService.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: 'มีการแก้ไขเคสนี้พร้อมกัน กรุณาลองใหม่', life: 6000 });
                    return;
                }
                // A 400 is the server refusing the data - queueing it would
                // retry the same rejection forever. Only a transport failure
                // is worth holding on to.
                const isTransport = err?.status === 0 || err?.status >= 500;
                if (isTransport && this.isNew()) {
                    const label = `${this.form.reporter || 'ไม่ระบุผู้แจ้ง'} · ${this.form.chief_complaint.slice(0, 30)}`;
                    this.drafts.enqueue(payload, label, err?.message ?? 'ส่งไม่สำเร็จ');
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

    /**
     * The browser's own refresh (toolbar, F5, Ctrl+R, Ctrl+F5), closing the
     * tab, or typing a new URL: the one exit the route guard and the buttons
     * cannot see. Nothing custom can run here - the page is being torn down
     * and the browser only allows its own generic "leave site?" prompt - so
     * this asks for that, and only while something typed would be lost.
     */
    onBeforeUnload(event: BeforeUnloadEvent): void {
        if (this.hasUnsavedChanges()) event.preventDefault();
    }

    requestClose(): void {
        this.confirmDiscard().then((ok) => ok && this.closed.emit());
    }

    /**
     * Whether the form may be thrown away: yes at once if nothing is typed,
     * otherwise the operator's answer. Every way out of the drawer goes
     * through here - the close buttons above, and the route guard for the
     * browser's Back button and for opening another case over this one, so
     * an accidental Back asks the same question the x does. Accepting
     * clears dirty, so the navigation that follows is not asked twice.
     */
    confirmDiscard(): Promise<boolean> {
        if (!this.hasUnsavedChanges()) return Promise.resolve(true);
        return new Promise((resolve) => {
            // Eight hours into a shift somebody will click this by accident.
            this.confirmationService.confirm({
                header: 'ปิดโดยไม่บันทึก?',
                message: 'ข้อมูลที่กรอกไว้ยังไม่ถูกบันทึก ต้องการปิดหรือไม่',
                // icon: 'pi pi-exclamation-triangle',
                // Red, because accepting throws the typed call away.
                acceptButtonProps: { label: 'ปิดหน้าต่าง', severity: 'danger' },
                rejectButtonProps: { label: 'กรอกต่อ', severity: 'secondary', outlined: true },
                accept: () => {
                    this.dirty.set(false);
                    resolve(true);
                },
                reject: () => resolve(false)
            });
        });
    }
}
