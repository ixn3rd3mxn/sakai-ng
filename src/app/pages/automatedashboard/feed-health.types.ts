// Mirrors the block backend/libs/feed_health.py attaches to every feed payload.
//
// This carries a distinction the existing `available`/`stale` pair cannot
// express, and the difference is the whole reason it exists. Those two answer
// "could the backend fetch it" - a question about the request. `trusted`
// answers "can what came back be true" - a question about the data.
//
// They came apart in September 2026, when NIEMS moved these APIs to a new host
// and left the old ones running. The retired endpoints kept answering HTTP 200
// with well-formed rows while the data behind them stood still, so `available`
// stayed true, `stale` stayed false, and the board displayed "0 calls today"
// to a room running an emergency line. Nothing about the fetch was wrong; the
// numbers simply were not real any more.

/** `error` means the data is contradicted by something else the backend holds.
 *  `warning` means it looks wrong but could still be a timing artefact. */
export type FeedIssueSeverity = 'error' | 'warning';

export interface FeedIssue {
    /** Stable identifier for the check that fired, e.g.
     *  `counters_contradicted_by_call_log`. Safe to match on. */
    code: string;
    severity: FeedIssueSeverity;
    /** English and technical, carrying the numbers that tripped the check.
     *  Written for a log drain and for `/api/health`, not for a wall display -
     *  the widgets render their own short Thai line from `severity` instead of
     *  showing this, which is why it is free to be verbose. */
    detail: string;
    /** True when the issue proves the data false rather than merely suspect.
     *  A discredited counter renders as a dash: showing a number we know to be
     *  wrong is worse than showing nothing at all. */
    discredits: boolean;
}

export interface FeedHealth {
    /** No issues at all. */
    ok: boolean;
    /** No *discrediting* issue. Kept apart from `ok` so a warning can annotate
     *  the board without emptying it - blanking real numbers over a timing
     *  artefact would be its own kind of lie. */
    trusted: boolean;
    issues: FeedIssue[];
}
