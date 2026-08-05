export interface TimePeriod {
    name: string;
}

export interface SelectOption {
    name: string;
    code?: string;
}

export interface DateTimeChangedEvent {
    isCurrent: boolean;
    date: Date | undefined;
    time: TimePeriod | null;
}
