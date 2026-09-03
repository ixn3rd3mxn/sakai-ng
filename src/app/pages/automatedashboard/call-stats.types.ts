// Mirrors the payload built by backend/libs/call_stats.py. The upstream NIEMS
// response carries more fields (missed_call, percent_sla, ...); the backend
// drops them, so this is deliberately the whole contract and not a subset.

import { FeedHealth } from './feed-health.types';
/** One hour of the Bangkok day, for the hourly chart. Always 24 of them, in
 *  order, with quiet hours present as zeros - a missing hour would shift every
 *  later bar one place to the left. */
export interface HourlyBucket {
    /** 0-23, from the upstream's own `pointer` rather than array position. */
    hour: number;
    /** `HH:00`, formatted server-side to match every other clock on the page. */
    label: string;
    /** Exactly `answer + missed` - verified across a full day, every hour. It
     *  is what makes the stacked bar honest rather than approximate: the total
     *  height of a bar *is* this number, not something close to it. */
    incoming: number;
    answer: number;
    /** The upstream's `missed_call`, which is `abandon + queue_full_abandon`.
     *  Carried as one number because queue-full abandons have been zero in
     *  every hour observed, so splitting them would add a permanently empty
     *  third segment to every bar. */
    missed: number;
}

export interface CallStatsSummary {
    /** Bangkok calendar day these counters cover, as `YYYY-MM-DD`. Resolved
     *  server-side - never computed in the browser, whose clock and timezone
     *  are not the dispatch centre's. */
    day: string;
    /** Whether `day` is the current Bangkok day. Same convention the dispatch
     *  and history pages use to drive their historical-data banners - the
     *  browser never derives it by comparing dates itself. */
    is_current: boolean;
    /** Epoch-second bounds the backend queried upstream with. Display/debug
     *  only; nothing in the UI recomputes them. */
    range_from: number;
    range_until: number;
    /** Bangkok wall-clock of the last successful upstream fetch, or null when
     *  there has never been one for `day`. */
    fetched_at: string | null;
    /** False when there are no numbers for `day`: the source was unreachable,
     *  or it holds nothing for that date (it retains roughly 110 days). The
     *  counters are zero in that case and MUST render as a dash - showing 0
     *  would state that no calls were handled, which for a past date is a
     *  false claim rather than a gap. */
    available: boolean;
    /** True when the most recent upstream attempt failed. If `available` is
     *  also true, the counters are the last good ones for this same `day`. */
    stale: boolean;
    /** True when incoming/answer/sla came from the live feed rather than the
     *  precomputed rollup. False means every counter is the rollup's, which
     *  lags 10+ minutes - the board looks identical either way, so this is the
     *  only way to tell.
     *
     *  Note the six counters come from two sources observed moments apart, so
     *  they do not reconcile: answer + abandon can fall short of incoming by
     *  however many calls landed inside the rollup's lag. */
    live: boolean;
    /** Whether these counters can be believed. Distinct from `available`,
     *  which says only that the backend got an answer - a retired endpoint
     *  answers perfectly well and reports zero calls all day.
     *
     *  When `trusted` is false the six cards render dashes rather than the
     *  numbers, the same treatment a day outside retention already gets. */
    health: FeedHealth;

    incoming: number;
    answer: number;
    sla: number;
    abandon: number;
    queue_full_abandon: number;
    outgoing: number;

    /** Duration statistics, or null when that feed has nothing for this day.
     *  Independent of `available`: the four duration cards can blank while the
     *  six counter cards still show numbers, and vice versa. */
    times: CallTimes | null;
    /** Per-duration change vs `compare_day`, in signed seconds, or null when
     *  either day's durations are missing.
     *
     *  Only `avg_accept` and `avg_service` are honest comparisons mid-day:
     *  averages do not depend on how much of the day has elapsed.
     *  `longest_accept` is a maximum that only climbs and `total_service` is
     *  cumulative, so both read low all morning simply because the day is
     *  young - the same partial-day caveat the counter row carries. */
    times_diff: CallTimes | null;

    /** 24 hourly buckets for the chart, or null when that feed could not be
     *  read. Independent of `available` and of `times`: the chart blanks on
     *  its own, exactly as the duration cards do. */
    hourly: HourlyBucket[] | null;

    /** The day `diff` is measured against - always the day before `day`. */
    compare_day: string;
    /** Per-counter change vs `compare_day`, or null when there is nothing
     *  honest to compare against (that day is outside retention, or could not
     *  be fetched). Null means "no comparison" and the line is hidden - it
     *  must never be shown as zeros, which would read as "no change".
     *
     *  Caveat by construction: while `day` is today this compares a day in
     *  progress against a completed one. The upstream ignores the time-of-day
     *  part of its range - a one-hour window returns the same totals as the
     *  whole day - so "yesterday up to this hour" cannot be requested. The
     *  figure is therefore at its most negative just after midnight and
     *  converges as the day fills in. Matches the dispatch page's shift diff. */
    diff: CallStatsDiff | null;
}

export type CallStatsDiff = Pick<CallStatsSummary, 'incoming' | 'answer' | 'sla' | 'abandon' | 'queue_full_abandon' | 'outgoing'>;

/** Duration statistics for the second row, every value in **seconds**.
 *  Formatting to H:MM:SS is the widget's job. */
export interface CallTimes {
    /** ค่าเฉลี่ยเวลาตอบรับ */
    avg_accept: number;
    /** เวลาที่ตอบรับนานที่สุด */
    longest_accept: number;
    /** ค่าเฉลี่ยเวลาคุยสาย */
    avg_service: number;
    /** ระยะเวลารวมคุยสาย */
    total_service: number;
}
