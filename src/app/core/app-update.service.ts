import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Resolved against <base href>, so it is the same file from every route. */
const VERSION_PATH = 'version.json';

// A dispatch console sits visible for a whole shift, so the interval - not the
// visibility hook - is what actually notices most deploys. Five minutes on a
// ~60 byte static file the CDN serves is free; the jitter is there so twenty
// consoles that opened together at shift change do not all reload in the same
// second and hit the backend as one wave of reconnecting SSE streams.
const CHECK_INTERVAL_MS = 5 * 60_000;
const CHECK_JITTER_MS = 90_000;

// Tabbing back and forth must not turn into a request per switch.
const MIN_CHECK_GAP_MS = 60_000;

const SNOOZE_MS = 30 * 60_000;

interface VersionFile {
    build?: unknown;
}

/**
 * Notices that a new build has been deployed while this tab was open, and
 * says so - it never reloads on its own.
 *
 * That restraint is the whole design. This app is where somebody records a
 * call that is happening right now; a reload they did not ask for, at the
 * moment they are typing an address, costs a real call. So the banner waits,
 * and `blockedReason()` lets a screen with unfinished work say why reloading
 * now would be worse than running one version behind for another minute.
 *
 * Two independent signals feed it:
 *
 *   frontend - `version.json`, written at build time by
 *              scripts/write-version.mjs. The bundle in this tab came from one
 *              Vercel deployment; this file always comes from the current one.
 *              This is the one that catches "the dev just pushed".
 *   backend  - the `server` frame the SSE endpoints open with. Separate
 *              because the two deploy separately: a backend contract change
 *              can strand a frontend that is otherwise perfectly current.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
    /** The build this tab booted with; null until the first check answers. */
    private readonly bootBuild = signal<string | null>(null);
    private readonly latestBuild = signal<string | null>(null);

    private readonly bootServerBuild = signal<string | null>(null);
    private readonly latestServerBuild = signal<string | null>(null);

    private readonly snoozed = signal(false);

    private lastCheckedAt = 0;
    private checking = false;
    private snoozeTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly blockers = new Set<() => string | null>();

    private readonly frontendChanged = computed(() => {
        const boot = this.bootBuild();
        const latest = this.latestBuild();
        return boot !== null && latest !== null && boot !== latest;
    });

    private readonly backendChanged = computed(() => {
        const boot = this.bootServerBuild();
        const latest = this.latestServerBuild();
        return boot !== null && latest !== null && boot !== latest;
    });

    /** True once a newer build exists and the operator has not snoozed it. */
    readonly updateAvailable = computed(() => !this.snoozed() && (this.frontendChanged() || this.backendChanged()));

    /** Which side moved - the banner wording differs, the action does not. */
    readonly scope = computed<'frontend' | 'backend' | null>(() => {
        if (this.frontendChanged()) return 'frontend';
        if (this.backendChanged()) return 'backend';
        return null;
    });

    constructor() {
        const destroyRef = inject(DestroyRef);

        void this.check();

        // Coming back to the tab is the cheapest moment to find out: the
        // operator is between calls by definition, and the check costs one
        // small conditional GET.
        const onVisible = () => {
            if (document.visibilityState === 'visible') void this.check();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);

        // A hidden tab is checked by nothing: it will be caught by the
        // visibility hook the moment it matters, and a background tab polling
        // all night is exactly the free-tier cost worth not paying.
        const timer = setInterval(
            () => {
                if (document.visibilityState === 'visible') void this.check();
            },
            CHECK_INTERVAL_MS + Math.floor(Math.random() * CHECK_JITTER_MS)
        );

        destroyRef.onDestroy(() => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
            clearInterval(timer);
            if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
        });
    }

    /**
     * Fetch version.json and record what it says.
     *
     * A failure is silence, never a banner: this runs from a console whose
     * connection drops, and "cannot reach the CDN" says nothing at all about
     * whether a deploy happened.
     */
    async check(): Promise<void> {
        if (this.checking) return;
        if (Date.now() - this.lastCheckedAt < MIN_CHECK_GAP_MS) return;
        this.checking = true;
        this.lastCheckedAt = Date.now();
        try {
            const url = new URL(VERSION_PATH, document.baseURI);
            // Belt and braces: no-store covers the HTTP cache, the query
            // string covers anything in between that ignores it.
            url.searchParams.set('_', String(Date.now()));
            const response = await fetch(url.toString(), { cache: 'no-store' });
            if (!response.ok) return;
            const body = (await response.json()) as VersionFile;
            const build = typeof body.build === 'string' && body.build ? body.build : null;
            if (!build) return;
            if (this.bootBuild() === null) this.bootBuild.set(build);
            this.latestBuild.set(build);
        } catch {
            // Offline, or version.json not deployed. Either way: no claim.
        } finally {
            this.checking = false;
        }
    }

    /**
     * Called with the `server` frame every SSE stream opens with.
     *
     * The first build seen becomes the baseline, so this is inert until the
     * backend is actually redeployed. A backend that sends no build id (it is
     * unset in the environment) is ignored entirely rather than treated as a
     * change - otherwise every free-tier cold start, which restarts the
     * process without deploying anything, would tell a whole shift to reload
     * for nothing.
     */
    reportServerBuild(raw: string): void {
        let build: string | null = null;
        try {
            const parsed = JSON.parse(raw) as VersionFile;
            build = typeof parsed.build === 'string' && parsed.build ? parsed.build : null;
        } catch {
            return;
        }
        if (!build) return;
        if (this.bootServerBuild() === null) this.bootServerBuild.set(build);
        this.latestServerBuild.set(build);
    }

    /**
     * Register something that reloading right now would cost.
     *
     * Returns a disposer. The callback returns the reason to show the
     * operator, or null when there is nothing to lose.
     */
    addReloadBlocker(reason: () => string | null): () => void {
        this.blockers.add(reason);
        return () => this.blockers.delete(reason);
    }

    /** The first registered reason a reload would cost something, if any. */
    blockedReason(): string | null {
        for (const blocker of this.blockers) {
            const reason = blocker();
            if (reason) return reason;
        }
        return null;
    }

    /** Hide the banner for a while; the newer build is still pending. */
    snooze(): void {
        this.snoozed.set(true);
        if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
        this.snoozeTimer = setTimeout(() => this.snoozed.set(false), SNOOZE_MS);
    }

    /**
     * A hard reload, not a router navigation: the point is to drop the
     * running bundle, and the router would keep it.
     */
    reload(): void {
        location.reload();
    }
}
