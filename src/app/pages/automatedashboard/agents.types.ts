// Mirrors the payload built by backend/libs/agents.py.

import { FeedHealth } from './feed-health.types';

/** The states the board shows. OFFLINE rows are filtered out server-side -
 *  those are unmanned spare extensions, not absent staff.
 *
 *  `unknown` is the catch-all for an upstream action we have not mapped. It
 *  exists because RINGING turned up in a live watch after this was first
 *  written, and an allow-list made that agent vanish from the board for the
 *  duration of the ring. Anything unrecognised is now shown, not dropped. */
export type AgentStatus = 'on_call' | 'ringing' | 'break' | 'available' | 'unknown';

export interface Agent {
    /** From the upstream feed, so always correct - unlike `name`, which comes
     *  from our own mapping and can go stale if a desk is reassigned and
     *  nobody updates it.
     *
     *  No longer rendered on the card by choice; it still stands in for a
     *  missing name, so an agent absent from the mapping remains identifiable
     *  rather than anonymous. */
    extension: string;
    /** null when the extension is not in the mapping (a new hire, say). The
     *  card still renders with the extension alone - an on-duty agent must
     *  never vanish from the board over a missing reference row. */
    name: string | null;
    /** 1 = call taker, 5 = supervisor. */
    role_id: number;
    role: string;
    status: AgentStatus;
    /** The raw upstream action, set only when `status` is `unknown`, so the
     *  card can show what the feed actually said. */
    action: string | null;
}

export interface AgentsSummary {
    /** False when the feed could not be read *and* the last good roster has
     *  aged past its grace window. Distinct from an empty `agents` array,
     *  which would mean nobody is on duty - a very different claim. */
    available: boolean;
    /** True when the most recent poll failed. With `available` also true these
     *  are the last good rows, held over so a transient blip does not empty
     *  the board - see the reasoning in backend/libs/agents.py `_payload`.
     *  `fetched_at` then says when they were actually read. */
    stale: boolean;
    agents: Agent[];
    counts: Partial<Record<AgentStatus | 'total', number>>;
    /** Naive Bangkok wall-clock of the last successful read. */
    fetched_at: string | null;
    /** Whether the roster can be believed, as opposed to whether it could be
     *  fetched - `available` and `stale` only ever answered the second.
     *
     *  The check that matters here reads the feed's own `action_at`: a
     *  decommissioned host serves a plausible roster whose timestamps have
     *  stopped moving, and the cards look identical either way. */
    health: FeedHealth;
}
