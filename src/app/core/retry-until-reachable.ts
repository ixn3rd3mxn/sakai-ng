import { MonoTypeOperatorFunction, filter, fromEvent, merge, retry, tap, timer } from 'rxjs';

/**
 * Retries a one-shot request until it gets an answer, on the schedule
 * `resilientEventSource` keeps for the streams, so a page asking for a
 * finished date range comes back by itself exactly as a live one does.
 *
 * Backoff doubles from 1s to a 30s cap, jittered so boards that lost the same
 * backend do not all return on the same tick. Two moments skip the wait:
 * the network coming back, and the tab being looked at again.
 *
 * `onFailure` runs on every failed attempt, before the wait - the page's cue
 * to say it cannot connect while this keeps trying underneath.
 * `onReconnecting` runs when the network coming back starts an attempt: the
 * one retry likely to work, so the page can show its skeleton for it (and
 * `onFailure` puts the message back if it does not). The timed retries
 * through an outage do not call it, so the page does not flicker between
 * the two on each one. Switching the request away (a switchMap upstream)
 * ends the retrying with it.
 */
export function retryUntilReachable<T>(onFailure: () => void, onReconnecting?: () => void): MonoTypeOperatorFunction<T> {
    const RETRY_MIN_MS = 1_000;
    const RETRY_MAX_MS = 30_000;
    const RETRY_JITTER = 0.25;

    return retry({
        delay: (_error, attempt) => {
            onFailure();
            const base = Math.min(RETRY_MIN_MS * 2 ** (attempt - 1), RETRY_MAX_MS);
            const jitter = base * RETRY_JITTER * (Math.random() * 2 - 1);
            return merge(
                timer(base + jitter),
                fromEvent(window, 'online').pipe(tap(() => onReconnecting?.())),
                fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible'))
            );
        }
    });
}
