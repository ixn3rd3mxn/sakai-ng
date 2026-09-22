import { Injectable, signal } from '@angular/core';
import { FloodCaseInput } from '../flood-intake.types';
import { RecentPicksStore } from '../../../shared/recent-picks';

const OUTBOX_KEY = 'flood-intake:outbox';
const RECENT_PICKS_KEY = 'flood-intake:recent-picks';

/**
 * The dropdowns that keep a per-device shortlist. The last three are the
 * free-text fields with a suggestion list (reporter, DDPM team, crew): the
 * shortlist there holds the text as saved, resolved against the list on
 * display, so a one-off typed value simply never shows.
 */
export type RecentPickKind = 'agent' | 'district' | 'subdistrict' | 'reporter' | 'ddpm' | 'unit';

const RECENT_PICK_KINDS: readonly RecentPickKind[] = ['agent', 'district', 'subdistrict', 'reporter', 'ddpm', 'unit'];

export interface OutboxEntry {
    id: string;
    queuedAt: number;
    attempts: number;
    lastError: string;
    body: FloodCaseInput;
    // Shown in the "not yet saved" banner so the operator can tell which call
    // is still outstanding without opening anything.
    label: string;
}

// Everything this page keeps in the browser rather than on the server: the
// outbox of calls the server has not acknowledged, because the disaster
// area's connection drops and a reload must not cost a call, plus the small
// habits of whoever sits at this console. (Form drafts used to live here too;
// they were dropped - a half-typed call coming back on the next open was more
// surprise than safety net.)
//
// localStorage is per-browser and never reaches the server. That is the point
// here: this is one operator's scratchpad, not shared state - which is also
// why the recent-agent list is per device and needs no account behind it.
@Injectable()
export class FloodDraftService {
    // Surfaced so the page can show how many calls are recorded but not yet
    // acknowledged by the server. Nothing is more dangerous on this page than
    // an operator believing a case was saved when it was not.
    readonly pending = signal<OutboxEntry[]>([]);

    // The shortlists themselves live in shared/recent-picks, which the
    // dispatch dashboard's CBD dropdown uses too; this page's are under its
    // own key.
    private readonly recents = new RecentPicksStore<RecentPickKind>(RECENT_PICKS_KEY, RECENT_PICK_KINDS);

    constructor() {
        this.pending.set(this.readOutbox());
    }

    private safeGet(key: string): string | null {
        // Private-mode browsers throw on access rather than returning null.
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    private safeSet(key: string, value: string): void {
        try {
            localStorage.setItem(key, value);
        } catch {
            // A full or blocked store must not break the form; the draft is a
            // convenience, the outbox retries in memory for this session.
        }
    }

    // --- outbox -------------------------------------------------------------

    private readOutbox(): OutboxEntry[] {
        const raw = this.safeGet(OUTBOX_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private writeOutbox(entries: OutboxEntry[]): void {
        this.safeSet(OUTBOX_KEY, JSON.stringify(entries));
        this.pending.set(entries);
    }

    enqueue(body: FloodCaseInput, label: string, error: string): OutboxEntry {
        const entry: OutboxEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            queuedAt: Date.now(),
            attempts: 1,
            lastError: error,
            body,
            label
        };
        this.writeOutbox([...this.readOutbox(), entry]);
        return entry;
    }

    markAttempt(id: string, error: string): void {
        this.writeOutbox(
            this.readOutbox().map((e) => (e.id === id ? { ...e, attempts: e.attempts + 1, lastError: error } : e))
        );
    }

    dequeue(id: string): void {
        this.writeOutbox(this.readOutbox().filter((e) => e.id !== id));
    }

    snapshot(): OutboxEntry[] {
        return this.readOutbox();
    }

    // --- recent picks -------------------------------------------------------

    /** This device's shortlist for one dropdown, newest first. */
    recentOf(kind: RecentPickKind): string[] {
        return this.recents.recentOf(kind);
    }

    /** Move a value to the front of this device's shortlist for `kind`. */
    remember(kind: RecentPickKind, value: string): void {
        this.recents.remember(kind, value);
    }
}
