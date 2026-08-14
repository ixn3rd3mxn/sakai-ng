// Local Y/M/D formatting - never toISOString(), which converts to UTC and
// can silently shift the date across the 08:30 operational-day boundary.

export function formatDateParam(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Thai Buddhist Era = Common Era + 543. Display-only conversion; every stored
// or transmitted date stays Gregorian (see formatDateParam/parseIsoDate above).
export const BUDDHIST_ERA_OFFSET = 543;

export function toBuddhistYear(date: Date): number {
    return date.getFullYear() + BUDDHIST_ERA_OFFSET;
}

// Shifts the year embedded in a dd/mm/yyyy string (the datepicker's dateFormat="dd/mm/yy",
// where PrimeNG's "yy" token means 4-digit year) from CE to BE. Anything not matching
// that shape (empty string, partial input) passes through unchanged.
export function shiftDisplayedYearToBuddhist(raw: string): string {
    const match = /^(\d{2}\/\d{2}\/)(\d{4})$/.exec(raw);
    if (!match) return raw;
    const [, prefix, year] = match;
    return `${prefix}${Number(year) + BUDDHIST_ERA_OFFSET}`;
}
