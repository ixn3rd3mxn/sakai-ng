import { signal } from '@angular/core';

// A per-device shortlist for a long dropdown: the handful of values one
// console actually uses, kept in localStorage and shown above the full list.
// Shared by the flood intake form (agent, amphoe, tambon) and the dispatch
// dashboard's save dialog (CBD).
//
// localStorage is per-browser and never reaches the server. That is the point:
// this is one operator's habits, not shared state - which is also why it needs
// no account behind it.

// Three is what fits above a list without pushing it off screen. These lists
// are shortcuts for the handful of values one console actually uses - a shift
// works one or two amphoe, is manned by one or two people, sees the same few
// CBDs - so a longer one would just be the full list again in a different
// order.
export const RECENT_PICKS_LIMIT = 3;

export type RecentPicks<K extends string> = Partial<Record<K, string[]>>;

export class RecentPicksStore<K extends string> {
    /** Values most recently picked on this device, newest first per dropdown. */
    readonly recentPicks = signal<RecentPicks<K>>({});

    constructor(
        private readonly storageKey: string,
        private readonly kinds: readonly K[],
        private readonly limit = RECENT_PICKS_LIMIT
    ) {
        this.recentPicks.set(this.read());
    }

    /** This device's shortlist for one dropdown, newest first. */
    recentOf(kind: K): string[] {
        return this.recentPicks()[kind] ?? [];
    }

    /** Move a value to the front of this device's shortlist for `kind`. */
    remember(kind: K, value: string): void {
        const picked = value?.trim();
        if (!picked) return;
        const current = this.recentOf(kind);
        const next = [picked, ...current.filter((v) => v !== picked)].slice(0, this.limit);
        // Re-picking the value already at the front changes nothing, and these
        // dropdowns are reopened all day - skip the write and the signal churn.
        if (next.length === current.length && next.every((v, i) => v === current[i])) return;
        const picks = { ...this.recentPicks(), [kind]: next };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(picks));
        } catch {
            // A full, blocked or private-mode store must not break the form;
            // the shortlist just lasts the session.
        }
        this.recentPicks.set(picks);
    }

    private read(): RecentPicks<K> {
        let raw: string | null;
        try {
            // Private-mode browsers throw on access rather than returning null.
            raw = localStorage.getItem(this.storageKey);
        } catch {
            return {};
        }
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (!parsed || typeof parsed !== 'object') return {};
            const picks: RecentPicks<K> = {};
            // Read defensively: this is the one store a stale tab or a hand-
            // edited localStorage can put anything into, and a bad entry must
            // cost a shortcut, not the dropdown.
            for (const kind of this.kinds) {
                const values = parsed[kind];
                if (!Array.isArray(values)) continue;
                picks[kind] = values.filter((v): v is string => typeof v === 'string' && !!v).slice(0, this.limit);
            }
            return picks;
        } catch {
            return {};
        }
    }
}

// The long dropdowns all read the same way: the handful of values this console
// actually uses on top, the full list underneath. Recents are resolved against
// the live list rather than trusted from storage, so a value that is no longer
// offered stops appearing without a migration - and a tambon remembered under
// another amphoe simply is not in the narrowed list.
//
// Recents stay in the full list as well: a name that jumps between two sections
// depending on who used the browser last is harder to find, not easier.
export interface OptionGroup<T> {
    label: string;
    items: T[];
}

export function groupByRecent<T>(all: T[], recent: string[], valueOf: (item: T) => string): OptionGroup<T>[] {
    return prependRecent([{ label: 'ทั้งหมด', items: all }], recent, valueOf);
}

// Every group header gets the same leading bullet, so a header reads as a
// section label and not as one more option in the list.
const HEADER_BULLET = '• ';

/**
 * Same shortlist, on top of a list that already has its own groups. Headers
 * of the given groups are bulleted here too, so callers pass plain labels.
 */
export function prependRecent<T>(groups: OptionGroup<T>[], recent: string[], valueOf: (item: T) => string): OptionGroup<T>[] {
    const all = groups.flatMap((group) => group.items);
    const shortlist = recent.map((value) => all.find((item) => valueOf(item) === value)).filter((item): item is T => !!item);
    const headed = groups.map((group) => ({ ...group, label: `${HEADER_BULLET}${group.label}` }));
    return shortlist.length ? [{ label: `${HEADER_BULLET}ใช้ล่าสุด`, items: shortlist }, ...headed] : headed;
}
