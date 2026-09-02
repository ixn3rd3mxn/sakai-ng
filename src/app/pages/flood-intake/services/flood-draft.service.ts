import { Injectable, signal } from '@angular/core';
import { FloodCaseInput } from '../flood-intake.types';

const DRAFT_PREFIX = 'flood-intake:draft:';
const OUTBOX_KEY = 'flood-intake:outbox';

export interface FloodDraft {
    savedAt: number;
    form: Record<string, unknown>;
}

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

// Two kinds of work that must survive the page going away, kept together
// because they answer the same question - "what did I type that is not safely
// stored yet?" - and both live in localStorage for the same reason: the
// disaster area's connection drops, and a reload must not cost a call.
//
// localStorage is per-browser and never reaches the server. That is the point
// here: this is a scratchpad for one operator's unfinished work, not shared
// state.
@Injectable()
export class FloodDraftService {
    // Surfaced so the page can show how many calls are recorded but not yet
    // acknowledged by the server. Nothing is more dangerous on this page than
    // an operator believing a case was saved when it was not.
    readonly pending = signal<OutboxEntry[]>([]);

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

    private safeRemove(key: string): void {
        try {
            localStorage.removeItem(key);
        } catch {
            /* see safeSet */
        }
    }

    // --- form drafts --------------------------------------------------------

    private draftKey(caseId: string): string {
        return `${DRAFT_PREFIX}${caseId}`;
    }

    saveDraft(caseId: string, form: Record<string, unknown>): void {
        this.safeSet(this.draftKey(caseId), JSON.stringify({ savedAt: Date.now(), form } satisfies FloodDraft));
    }

    readDraft(caseId: string): FloodDraft | null {
        const raw = this.safeGet(this.draftKey(caseId));
        if (!raw) return null;
        try {
            const draft = JSON.parse(raw) as FloodDraft;
            return draft?.form ? draft : null;
        } catch {
            return null;
        }
    }

    clearDraft(caseId: string): void {
        this.safeRemove(this.draftKey(caseId));
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
}
