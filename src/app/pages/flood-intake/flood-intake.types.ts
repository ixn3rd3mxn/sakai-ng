// Mirrors the payloads in backend/libs/flood_cases.py. Codes and their Thai
// labels both travel on every case: the backend resolves them once so the
// table, the export and the duplicate warning cannot disagree about what a
// code means.

export type FloodShift = 'morning' | 'afternoon' | 'night';
export type FloodStatus = 'success' | 'pending';
export type FloodTab = 'all' | 'today' | 'current_shift' | 'pending' | 'success';

export interface FloodCase {
    case_id: string;
    reported_at: string;
    date: string;
    // "14.20" - the form the duplicate warning reads aloud ("14.20 น.").
    time: string;
    operational_day: string;
    shift: FloodShift | '';
    shift_label: string;
    // The document stores keys (agent_id, channel_id, the two area codes);
    // every name here is resolved by the server from its lookup cache.
    agent_id: string;
    agent_name: string;
    agent_extension: string;
    channel_id: number | null;
    channel_label: string;
    reporter: string;
    // Digits only, as stored; `phone_display` is the same number grouped.
    phone: string;
    phone_display: string;
    district_code: string;
    district_name: string;
    subdistrict_code: string;
    subdistrict_name: string;
    location_note: string;
    gender: string;
    gender_label: string;
    age: number | null;
    // Months past the whole years, recorded for small children only.
    age_months: number | null;
    age_days: number | null;
    age_label: string;
    chief_complaint: string;
    ddpm_coordination: string;
    operating_unit: string;
    assistance: string;
    status: FloodStatus;
    status_label: string;
    remarks: string;
    updated_at: string;
}

// One save of a case, as the drawer's history dialog lists it. The values
// are the text the table showed before and after - fixed when the edit was
// made, so a later rename in a lookup does not rewrite the past.
export interface FloodHistoryChange {
    field: string;
    label: string;
    from: string;
    to: string;
}

export interface FloodHistoryEntry {
    at: string;
    changes: FloodHistoryChange[];
}

// Only present on a case returned by the duplicate check: why it was flagged.
export interface FloodDuplicate extends FloodCase {
    match_reason: 'phone' | 'location';
}

export interface FloodContext {
    operational_day: string;
    shift: FloodShift;
    shift_label: string;
    server_now: string;
    // True while a case has been logged within the last week. The "วันนี้" and
    // "เวรนี้" tabs exist only for the live event; outside it they would sit at
    // zero for whoever reviews the records months later.
    active: boolean;
}

export interface FloodCaseCounts {
    all: number;
    today: number;
    current_shift: number;
    pending: number;
    success: number;
}

export interface FloodCasesResponse {
    context: FloodContext;
    cases: FloodCase[];
    total: number;
    offset: number;
    limit: number;
    // The filter matched more rows than were returned. Surfaced rather than
    // ignored: an operator scanning for a duplicate has to know the list in
    // front of them is not the whole answer.
    truncated: boolean;
    counts: FloodCaseCounts;
}

export interface FloodDistrict {
    district_id: number;
    district_code: string;
    district_name: string;
}

export interface FloodSubdistrict {
    subdistrict_id: number;
    district_id: number;
    district_code: string;
    subdistrict_code: string;
    subdistrict_name: string;
}

export interface FloodAgent {
    // Roster number. The list arrives ordered by it, not alphabetically, so
    // the dropdown reads the way the staff list on the wall does.
    agent_id: string;
    agent_name: string;
    agent_extension: string;
}

export interface FloodOption {
    code: string;
    label: string;
}

/** A row of the EMS `reporting_channels` collection. */
export interface FloodChannel {
    channel_id: number;
    channel_name: string;
}

export interface FloodLookupsResponse {
    districts: FloodDistrict[];
    subdistricts: FloodSubdistrict[];
    agents: FloodAgent[];
    channels: FloodChannel[];
    genders: FloodOption[];
    statuses: FloodOption[];
    shifts: FloodOption[];
    // Badges under the three free-text fields, and the suggestion list
    // behind each one's dropdown. Names only: the fields stay free text.
    reporter_shortcuts: string[];
    ddpm_shortcuts: string[];
    crew_shortcuts: string[];
    notifiers: string[];
    ddpm_teams: string[];
    crews: string[];
}

export interface FloodDuplicateResponse {
    matches: FloodDuplicate[];
    window_hours: number;
}

// What the table narrows by. Every field here is applied server-side, so the
// counts beside the tabs and the export both describe the same set of rows
// the operator is looking at.
export interface FloodFilterState {
    tab: FloodTab;
    search: string;
    dateFrom: string | null;
    dateTo: string | null;
    // Hand-picked days, ISO. Set instead of dateFrom/dateTo, never with them:
    // the one date control is in one of three modes at a time.
    dates: string[];
    districtCode: string | null;
    // Always a tambon of districtCode when both are set - the data service
    // keeps the pair consistent, as the drawer does.
    subdistrictCode: string | null;
    shift: FloodShift | null;
    agentId: string | null;
    // Which way the table runs by time. Sorted by the server, since past
    // the row limit the browser only holds one end of the set.
    order: FloodSortOrder;
}

export type FloodSortOrder = 'desc' | 'asc';

export const EMPTY_FILTERS: FloodFilterState = {
    tab: 'all',
    search: '',
    dateFrom: null,
    dateTo: null,
    dates: [],
    districtCode: null,
    subdistrictCode: null,
    shift: null,
    agentId: null,
    order: 'desc'
};

// The body POST/PATCH accept. Only district, subdistrict and chief_complaint
// are required - a call that drops after twenty seconds still has to be
// recorded, so everything else may be blank.
/**
 * A partial edit: only the fields present are written, so two operators
 * finishing different parts of one case cannot overwrite each other. A
 * field sent as null is cleared; a field left out is left alone.
 *
 * `base` is what the form started from for those same fields. If one of
 * them has since been changed by someone else, the server answers 409 with
 * the stored case instead of writing over it.
 */
export type FloodCasePatch = Partial<FloodCaseInput> & { base?: Partial<FloodCaseInput> };

export interface FloodCaseInput {
    district: string;
    subdistrict: string;
    chief_complaint: string;
    reported_at?: string | null;
    shift?: FloodShift | null;
    agent_id?: string | null;
    channel_id?: number | null;
    reporter?: string | null;
    phone?: string | null;
    location_note?: string | null;
    gender?: string | null;
    age?: number | null;
    age_months?: number | null;
    age_days?: number | null;
    ddpm_coordination?: string | null;
    operating_unit?: string | null;
    assistance?: string | null;
    status?: string | null;
    remarks?: string | null;
}
