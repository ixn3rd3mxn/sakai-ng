export interface IncidentHistoryItem {
    incident_id: string;
    // Calendar date of the timestamp; the range view shows it beside the time.
    date?: string;
    time: string;
    hour: string;
    call_type: string;
    reporting_channel: string;
    case_type: string;
    cbd: string;
    severity: string;
}

export interface IncidentStatItem {
    name: string;
    shift_morning: number;
    shift_afternoon: number;
    shift_night: number;
    daily: number;
    weekly: number;
    monthly: number;
}

export interface IncidentHistoryContext {
    operational_day: string;
    is_current: boolean;
    server_now: string;
}

export interface IncidentHistoryStatistics {
    call_type: IncidentStatItem[];
    reporting_channel: IncidentStatItem[];
    case_type: IncidentStatItem[];
    severity: IncidentStatItem[];
    cbd: IncidentStatItem[];
}

export interface TopDayItem {
    operational_day: string;
    count: number;
}

export interface IncidentHistoryResponse {
    context: IncidentHistoryContext;
    incidents: IncidentHistoryItem[];
    statistics: IncidentHistoryStatistics;
    top_days: TopDayItem[];
}

// The page over several days or a range (GET /incident-history/range): each
// shift summed over the days, the total, and the average per day, in place
// of the one-day view's day/week/month columns.
export interface IncidentRangeStatItem {
    name: string;
    shift_morning: number;
    shift_afternoon: number;
    shift_night: number;
    total: number;
    daily_average: number;
}

export interface IncidentRangeStatistics {
    call_type: IncidentRangeStatItem[];
    reporting_channel: IncidentRangeStatItem[];
    case_type: IncidentRangeStatItem[];
    severity: IncidentRangeStatItem[];
    cbd: IncidentRangeStatItem[];
}

export interface IncidentRangeResponse {
    context: { days: string[]; day_count: number; server_now: string };
    // Capped server-side; incidents_total is the real count.
    incidents: IncidentHistoryItem[];
    incidents_total: number;
    statistics: IncidentRangeStatistics;
    // Every chosen day, zero days included, oldest first.
    per_day: TopDayItem[];
    top_days: TopDayItem[];
}

// What the date dialog asks for beyond a single day.
export type IncidentRangeSelection = { kind: 'range'; from: Date; to: Date } | { kind: 'days'; dates: Date[] };

export interface LookupItem {
    id: number;
    name: string;
    des?: string;
}

export interface LookupsResponse {
    call_types: LookupItem[];
    case_types: LookupItem[];
    cbd_categories: LookupItem[];
    reporting_channels: LookupItem[];
    severity_levels: LookupItem[];
}
