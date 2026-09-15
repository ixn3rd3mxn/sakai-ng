/**
 * Opens an EventSource that comes back from the one failure the browser's own
 * retry never recovers from.
 *
 * EventSource reconnects by itself after a *network* error - the socket
 * dropped, the server closed the stream - and while it is doing so its
 * readyState is CONNECTING. What it does not survive is a response that is not
 * a stream: a non-200 status, a body that is not text/event-stream, or a
 * cross-origin response with no CORS header. On any of those it fires `error`
 * with readyState CLOSED and stops for good.
 *
 * That is precisely what a backend restart produces. The app process on the
 * free tier cold-starts all day, and while it is down the platform's edge
 * answers in its place - with an error page that, not being the app, carries
 * none of the app's CORS headers. A board reconnecting into that window gets
 * a CORS rejection, EventSource closes, and the board is frozen until someone
 * reloads it by hand. The wall monitor sat on a stale afternoon total for a
 * whole night that way, with `ERR_HTTP2_PROTOCOL_ERROR`, three of the
 * browser's own retries, and then a CORS error in its console - the last
 * thing it ever logged.
 *
 * So this wraps the source and treats CLOSED as "try again", with backoff so
 * a backend that stays down is not hammered, and with two shortcuts past the
 * backoff for the moments a retry is most likely to succeed: the network
 * coming back, and the tab being looked at again.
 *
 * It also does the opposite: a tab that has been hidden for a while has its
 * stream closed, and reopened the moment the tab is looked at again. Every
 * stream on this app is a full snapshot on each frame, so nothing is lost by
 * not listening for an hour - the backend hands a new subscriber its latest
 * payload at once - and a dashboard forgotten in a background tab is the
 * usual reason a poll loop on the backend is still running for nobody. The
 * grace before closing is there because people alt-tab constantly, and
 * because Chrome's window-occlusion tracking can report hidden for a moment
 * while windows are being dragged; a quick look-away must not cost five
 * reconnects. `pagehide` closes at once, since a page the OS is about to
 * freeze (mobile, mostly) cannot wait out a grace period anyway.
 *
 * `attach` is called with every source this creates, not just the first -
 * listeners belong to a source, and a rebuilt source starts with none. The
 * returned function tears everything down; use it as the Observable's
 * teardown.
 */
export function resilientEventSource(url: string, attach: (source: EventSource) => void): () => void {
    // Doubled on each consecutive failure, capped, and jittered so a fleet of
    // boards that all lost the same backend do not all come back on the same
    // tick and knock it over again.
    const RETRY_MIN_MS = 1_000;
    const RETRY_MAX_MS = 30_000;
    const RETRY_JITTER = 0.25;

    // How long a connection must stay up before it counts as healthy. A
    // backend that answers 200 and then drops the stream a moment later is
    // flapping, not back - and if every `open` reset the backoff, a flapping
    // backend would be hit once a second by every board, which is the one way
    // this helper could be worse for it than the old give-up behaviour.
    const STABLE_AFTER_MS = 10_000;

    // How long a tab stays hidden before its stream is closed. A minute:
    // "check something and come back" is under thirty seconds, and a
    // departure past a minute is almost always a real one. The saving from
    // cutting this to 20s would be 40 seconds of polling per real departure,
    // paid for with a reconnect on every quick lookup.
    const HIDDEN_CLOSE_MS = 60_000;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stableTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let disposed = false;
    // Closed on purpose because nobody can see the tab - as opposed to closed
    // by a failure. A parked stream is not retried by anything until the tab
    // is visible again.
    let parked = false;

    const open = () => {
        if (disposed || parked) return;
        clearTimeout(retryTimer);
        retryTimer = undefined;
        clearTimeout(stableTimer);
        stableTimer = undefined;

        source?.close();
        // Captured, not read through the shared `source` binding: these
        // handlers belong to this instance and must judge this instance's
        // state, never a successor's.
        const current = new EventSource(url);
        source = current;
        attach(current);

        current.addEventListener('open', () => {
            stableTimer = setTimeout(() => {
                if (source === current) failures = 0;
            }, STABLE_AFTER_MS);
        });

        current.onerror = () => {
            if (source !== current) return;
            // CONNECTING is the browser already retrying a network error on
            // its own schedule. Leave it to it - stacking a second reconnect
            // on top would only double the load on a backend that is
            // struggling.
            if (current.readyState !== EventSource.CLOSED) return;
            clearTimeout(stableTimer);
            stableTimer = undefined;
            scheduleRetry();
        };
    };

    const scheduleRetry = () => {
        if (disposed || retryTimer !== undefined) return;
        const base = Math.min(RETRY_MIN_MS * 2 ** failures, RETRY_MAX_MS);
        const jitter = base * RETRY_JITTER * (Math.random() * 2 - 1);
        failures += 1;
        retryTimer = setTimeout(open, base + jitter);
    };

    // Two events that say "now is a good time": both mean the reason for the
    // last failure has probably gone away, so waiting out the rest of a 30s
    // backoff would be waiting for nothing.
    const retryNow = () => {
        if (disposed || parked) return;
        if (source?.readyState === EventSource.CLOSED || retryTimer !== undefined) {
            clearTimeout(retryTimer);
            retryTimer = undefined;
            open();
        }
    };

    // Close because the tab is not being looked at. Not a failure: the
    // backoff counter is left alone, and nothing schedules a retry.
    const park = () => {
        clearTimeout(hiddenTimer);
        hiddenTimer = undefined;
        if (disposed || parked) return;
        parked = true;
        clearTimeout(retryTimer);
        retryTimer = undefined;
        clearTimeout(stableTimer);
        stableTimer = undefined;
        source?.close();
        source = null;
    };

    // Runs at start and on every visibility change, so a page opened straight
    // into a background tab is treated the same as one that was switched
    // away from later.
    const syncVisibility = () => {
        if (disposed) return;
        if (document.visibilityState === 'visible') {
            clearTimeout(hiddenTimer);
            hiddenTimer = undefined;
            if (parked) {
                parked = false;
                open();
            } else {
                // The old shortcut: a tab being looked at again is a good
                // moment to retry a stream that was failing.
                retryNow();
            }
        } else if (hiddenTimer === undefined && !parked) {
            hiddenTimer = setTimeout(park, HIDDEN_CLOSE_MS);
        }
    };
    // A page the browser is about to freeze or put in the back-forward cache
    // (a phone switching apps, mostly) cannot wait out the grace, and a
    // stream left open into a freeze is a subscriber the backend keeps
    // polling for until the socket times out. `pageshow` is the matching
    // wake-up for a restore from that cache, where visibilitychange may not
    // fire.
    const onPageHide = () => park();
    const onPageShow = () => syncVisibility();

    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);

    open();
    syncVisibility();

    return () => {
        disposed = true;
        clearTimeout(retryTimer);
        clearTimeout(stableTimer);
        clearTimeout(hiddenTimer);
        window.removeEventListener('online', retryNow);
        document.removeEventListener('visibilitychange', syncVisibility);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        source?.close();
        source = null;
    };
}
