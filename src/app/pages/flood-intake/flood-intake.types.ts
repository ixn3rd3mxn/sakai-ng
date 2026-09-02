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
    agent_name: string;
    agent_extension: string;
    channel: string;
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
    chief_complaint: string;
    ddpm_coordination: string;
    operating_unit: string;
    assistance: string;
    status: FloodStatus;
    status_label: string;
    remarks: string;
    updated_at: string;
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
    agent_name: string;
    agent_extension: string;
}

export interface FloodOption {
    code: string;
    label: string;
}

export interface FloodLookupsResponse {
    districts: FloodDistrict[];
    subdistricts: FloodSubdistrict[];
    agents: FloodAgent[];
    channels: FloodOption[];
    genders: FloodOption[];
    statuses: FloodOption[];
    shifts: FloodOption[];
    reporter_shortcuts: string[];
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
    districtCode: string | null;
    shift: FloodShift | null;
    agentName: string | null;
}

export const EMPTY_FILTERS: FloodFilterState = {
    tab: 'all',
    search: '',
    dateFrom: null,
    dateTo: null,
    districtCode: null,
    shift: null,
    agentName: null
};

// The body POST/PATCH accept. Only district, subdistrict and chief_complaint
// are required - a call that drops after twenty seconds still has to be
// recorded, so everything else may be blank.
export interface FloodCaseInput {
    district: string;
    subdistrict: string;
    chief_complaint: string;
    reported_at?: string | null;
    shift?: FloodShift | null;
    agent_name?: string | null;
    agent_extension?: string | null;
    channel?: string | null;
    reporter?: string | null;
    phone?: string | null;
    location_note?: string | null;
    gender?: string | null;
    age?: number | null;
    ddpm_coordination?: string | null;
    operating_unit?: string | null;
    assistance?: string | null;
    status?: string | null;
    remarks?: string | null;
}
