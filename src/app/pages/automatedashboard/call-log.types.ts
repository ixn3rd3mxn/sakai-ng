// Mirrors the payload built by backend/libs/call_log.py.
//
// (See ./feed-health.types for what `health` adds over the two flags below.)

import { FeedHealth } from './feed-health.types';
//
// Two upstream feeds behind one payload, and they fail independently - hence
// the two `*_available` flags rather than one. The abandoned-call feed is
// roughly seventy times slower than the call log, so one being unreachable
// while the other answers is a normal state, not an edge case.

/** The outcome the upstream recorded for a call. `unknown` is the catch-all
 *  for an action we have not mapped - it renders with the raw value rather than
 *  being hidden, so a new upstream outcome is something to ask about instead of
 *  a call that silently never appears. */
export type CallStatus = 'answered' | 'abandoned' | 'queue_full' | 'no_answer' | 'unknown';

export interface CallLogEntry {
    /** From our own Mongo mapping. Null when the desk is unmapped *or* when the
     *  call never reached a desk at all - see `reached_agent`. */
    agent: string | null;
    /** The agent's extension, or null when the call never reached one. A
     *  queue-full row carries the queue ("942") in the upstream's
     *  `destination`; showing that would invent an agent who handled it. */
    extension: string | null;
    /** False for a call that ended in the queue and was never delivered to
     *  anybody. The agent column shows a dash rather than a name. */
    reached_agent: boolean;
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
    /** Seconds between the two above, clamped at zero. For an answered call
     *  this is talk time; for every other status it is how long the caller
     *  waited before the call ended - which is why the column is labelled
     *  "รวมเวลา" and not something that claims conversation. */
    duration: number;
    status: CallStatus;
    /** The raw upstream action, set only when `status` is `unknown`. */
    action: string | null;
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

/** One frame of `/call-log/missed/stream`: the abandoned-call table alone. */
export interface MissedCallsSummary {
    /** Bangkok calendar day, resolved server-side. */
    day: string;
    /** False when the feed could not be read. Distinct from an empty array,
     *  which means "none today" - a real and reassuring claim that must not be
     *  made on the strength of a failed request. */
    missed_available: boolean;
    missed: MissedCallEntry[];
    /** Naive Bangkok wall-clock of the last cycle in which the feed read. */
    fetched_at: string | null;
    health: FeedHealth;
}

/** One frame of `/call-log/calls/stream`: the answered-call table alone. */
export interface CallsSummary {
    day: string;
    calls_available: boolean;
    calls: CallLogEntry[];
    fetched_at: string | null;
    /** This log is the independent witness the counters are checked against -
     *  it lists calls one by one over a different endpoint, so it can
     *  contradict a summary feed claiming the day was silent. A contradiction
     *  lands on both payloads, because either side could be the stale one. */
    health: FeedHealth;
}

/** Both tables in one payload - the shape of the one-shot `GET /call-log`.
 *  The live boards stream the two halves separately (see the two services),
 *  so that a table switched off stops its own upstream polling. */
export type CallLogSummary = MissedCallsSummary & CallsSummary;
