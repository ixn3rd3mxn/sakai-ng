import { ErrorHandler, Injectable } from '@angular/core';

const RELOAD_KEY = 'app-update:chunk-reload-at';

// Long enough that a reload which lands on a still-broken deployment does not
// immediately try again, short enough that a genuine second occurrence hours
// later is still handled.
const RELOAD_COOLDOWN_MS = 60_000;

// Every browser words this differently, and none of them are typed. Angular's
// own ChunkLoadError name covers the webpack-era message; the rest are what
// native dynamic import throws in Chrome, Firefox and Safari respectively -
// which is what this build actually produces for a lazy route.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk \S+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

function isChunkLoadError(error: unknown): boolean {
    const parts: string[] = [];
    let current: unknown = error;
    // Angular wraps the original in `cause` often enough that only checking
    // the top-level message misses the real one.
    for (let depth = 0; current && depth < 4; depth += 1) {
        const err = current as { name?: unknown; message?: unknown; cause?: unknown };
        if (typeof err.name === 'string') parts.push(err.name);
        if (typeof err.message === 'string') parts.push(err.message);
        current = err.cause;
    }
    if (parts.length === 0 && typeof error === 'string') parts.push(error);
    return CHUNK_ERROR.test(parts.join(' '));
}

/**
 * Reloads once when a lazy chunk cannot be fetched.
 *
 * This is the failure the update banner cannot help with. A tab that has been
 * open across a deploy is still holding the old index, and the moment the
 * operator opens a route it has not loaded yet, the browser asks the CDN for a
 * content-hashed file that deployment no longer serves. Nothing renders and
 * nothing recovers: the app is simply dead until somebody reloads by hand,
 * which is not a thing to ask of a person who is on a call.
 *
 * Reloading here is safe in a way an unprompted update reload is not - the
 * navigation the operator asked for has already failed, so there is no work in
 * progress left to interrupt.
 *
 * The sessionStorage stamp is what keeps it from becoming a reload loop if the
 * chunk is missing for some other reason. When storage is unavailable at all
 * (private mode, blocked site data) it declines to reload rather than risk
 * looping without a way to count.
 */
@Injectable()
export class ChunkErrorHandler extends ErrorHandler {
    override handleError(error: unknown): void {
        if (isChunkLoadError(error) && this.reloadOnce()) return;
        super.handleError(error);
    }

    private reloadOnce(): boolean {
        let last = 0;
        try {
            last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
            if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
            return false;
        }
        location.reload();
        return true;
    }
}
