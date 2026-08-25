export interface IncidentHistoryItem {
    incident_id: string;
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
