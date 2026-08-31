// Mirrors the payload built by backend/libs/call_log.py.
//
// Two upstream feeds behind one payload, and they fail independently - hence
// the two `*_available` flags rather than one. The abandoned-call feed is
// roughly seventy times slower than the call log, so one being unreachable
// while the other answers is a normal state, not an edge case.

export interface CallLogEntry {
    /** From our own Mongo mapping, so null for an unmapped desk. The extension
     *  stands in - a handled call must never show a blank operator because a
     *  reference row is missing. */
    agent: string | null;
    /** From the upstream feed, so always correct, unlike `agent`. */
    extension: string;
    /** The caller. Taken from `a_number`, not `source`: on a sampled day three
     *  rows carried an agent extension in `source` (an internal transfer)
     *  while `a_number` held the outside number throughout. */
    phone: string;
    /** Bangkok wall-clock `HH:mm:ss`, formatted server-side so the viewer's
     *  timezone never enters into it.
     *
     *  Named for what we asked the upstream for rather than what it means:
     *  `call_begin_at` could not be confirmed as the moment of answer rather
     *  than the moment the call was delivered to the desk, because the
     *  call-log feed does not reconcile with /v2/stats/summary/times. The
     *  column heading says "ช่วงเวลาการโทร" for that reason, not "สนทนา". */
    answered_at: string;
    hung_up_at: string;
    /** Seconds between the two above, clamped at zero. Carried rather than
     *  derived in the browser: only the backend holds the epoch values, so
     *  only it can subtract them correctly across a midnight boundary. */
    duration: number;
    /** Sort key the backend has already ordered by, newest first. */
    begin_epoch: number;
}

export interface MissedCallEntry {
    /** null when the caller withheld their number - see `anonymous`. The
     *  widget shows a placeholder, never an empty cell. */
    phone: string | null;
    /** Bangkok wall-clock `HH:mm:ss` of the most recent attempt. */
    at: string;
    at_epoch: number;
    /** How many times this number tried and gave up today.
     *
     *  The upstream groups by caller, not by call, so a row is a *number* and
     *  not an attempt - eleven rows can represent more than eleven abandoned
     *  calls. Not rendered at present, but carried, because without it someone
     *  who tried six times looks identical to someone who tried once. */
    attempts: number;
    anonymous: boolean;
}

export interface CallLogSummary {
    /** Bangkok calendar day, resolved server-side. */
    day: string;
    /** False when that feed could not be read. Distinct from an empty array,
     *  which means "none today" - a real and reassuring claim that must not be
     *  made on the strength of a failed request. */
    missed_available: boolean;
    calls_available: boolean;
    missed: MissedCallEntry[];
    calls: CallLogEntry[];
    /** Naive Bangkok wall-clock of the last cycle in which either feed read. */
    fetched_at: string | null;
}
