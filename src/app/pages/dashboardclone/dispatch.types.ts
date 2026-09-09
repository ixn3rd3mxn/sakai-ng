export interface TimePeriod {
    name: string;
}

export interface SelectOption {
    name: string;
    code?: string;
}

// Mirrors backend `libs.shift.Shift` - the single source of truth for shift
// boundaries lives there (backend/libs/shift.py); the frontend only ever
// echoes back what the API resolved.
export type ShiftCode = 'morning' | 'afternoon' | 'night';

export const SHIFT_CODE_TO_LABEL: Record<ShiftCode, string> = {
    morning: 'เช้า',
    afternoon: 'บ่าย',
    night: 'ดึก'
};

export const SHIFT_LABEL_TO_CODE: Record<string, ShiftCode> = {
    เช้า: 'morning',
    บ่าย: 'afternoon',
    ดึก: 'night'
};

export type Team = 'morning' | 'afternoon_night';

export interface OperationalContext {
    operational_day: string;
    shift: ShiftCode;
    shift_label: string;
    team: Team;
    team_label: string;
    window_start: string;
    window_end: string;
    day_start: string;
    day_end: string;
    is_current: boolean;
    server_now: string;
}

export interface IncidentTypeItem {
    call_id: number;
    call_name: string;
    count: number;
    diff: number;
}

export interface IncidentTypeStats {
    total: { count: number; diff: number };
    items: IncidentTypeItem[];
}

export interface BreakdownItem {
    id: number;
    name: string;
    count: number;
}

/** The แจ้งเหตุ count cut two ways. Each list sums to the แจ้งเหตุ entry in
 *  IncidentTypeStats.items - the backend only records a case or channel for
 *  that call type, and requires both when it does. */
export interface IncidentBreakdowns {
    case_type: BreakdownItem[];
    reporting_channel: BreakdownItem[];
}

export interface DailySummary {
    morning: number;
    afternoon: number;
    night: number;
}

export interface SeverityItem {
    severity_id: number;
    severity_name: string;
    count: number;
}

export interface CbdItem {
    cbd_id: number;
    cbd_name: string;
    count: number;
}

export interface RecentIncidentItem {
    incident_id: string;
    time: string;
    timestamp: string;
    call_type: string;
    cbd: string;
    severity: string;
}

export interface DashboardSummary {
    context: OperationalContext;
    incident_type_stats: IncidentTypeStats;
    incident_breakdowns: IncidentBreakdowns;
    daily_summary: DailySummary;
    severity_stats: SeverityItem[];
    frequent_cbd: CbdItem[];
    recent_incidents: RecentIncidentItem[];
}

export type CallTypeCode = 'NY' | 'RM' | 'LDN' | 'IST' | 'PRS';

export interface IncidentCreateRequest {
    call_type_code: CallTypeCode;
    reporting_channel_name?: string;
    case_type_name?: string;
    cbd_name?: string;
    severity_name?: string;
}

export interface IncidentCreateResponse {
    incident: {
        incident_id: string;
        time: string;
        call_type: string;
        cbd: string;
        severity: string;
    };
    context: OperationalContext;
}
