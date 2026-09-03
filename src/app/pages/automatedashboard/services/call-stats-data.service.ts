import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CallStatsSummary } from '../call-stats.types';
import { feedHealthMessage } from '../format-utils';
import { CallStatsApiService } from './call-stats-api.service';
import { formatDateParam } from '../../dashboardclone/services/date-utils';

// Owns the one day selection for the automate dashboard and the stats it
// resolves to. `null` means "today", left for the backend to resolve rather
// than pinned to a date here - otherwise a dashboard left open overnight
// would stay stuck on the day it was opened.
@Injectable()
export class CallStatsDataService implements OnDestroy {
    private readonly api = inject(CallStatsApiService);

    private readonly selection$ = new BehaviorSubject<string | null>(null);
    private readonly subscription: Subscription;

    private readonly _summary = signal<CallStatsSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    // True until a payload arrives for the *current* selection. Re-armed on
    // every switch, so one day's numbers are never shown under another day's
    // date while the next request is in flight.
    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    /** Whether the numbers on screen are real. False while loading, and false
     *  when there is no data for the selected day. */
    readonly hasNumbers = computed(() => !this._loading() && (this._summary()?.available ?? false));

    /** Real numbers, but the last upstream attempt failed - they will stop
     *  advancing until it recovers. */
    readonly isStale = computed(() => this.hasNumbers() && (this._summary()?.stale ?? false));

    /** The backend's verdict on whether this feed's data can be believed.
     *  Defaults to trusting it, so a backend that predates the field leaves
     *  the board unchanged rather than blanking it. */
    readonly trusted = computed(() => this._summary()?.health?.trusted ?? true);

    /** Short Thai line for the status area, or `''` when the feed is fine. */
    readonly healthMessage = computed(() => (this._loading() ? '' : feedHealthMessage(this._summary()?.health)));

    /** Server-decided, never a date comparison here. Assume "current" while
     *  loading so the historical banner does not flash on first paint. */
    readonly isCurrent = computed(() => this._summary()?.is_current ?? true);

    /** The day actually being shown, as `YYYY-MM-DD`. */
    readonly day = computed(() => this._summary()?.day ?? null);

    // The last day the server called current. Kept so the picker's bounds and
    // the prev/next steps are anchored to the dispatch centre's clock rather
    // than the viewer's, which may be in another timezone or simply wrong.
    // Only ever written from a payload the server flagged `is_current`.
    private readonly _serverToday = signal<string | null>(null);
    readonly serverToday = this._serverToday.asReadonly();

    constructor() {
        this.subscription = this.selection$
            .pipe(
                switchMap((day) => {
                    // Today streams (it is still changing, and rolls over at
                    // midnight). A finished day is fetched once - there is
                    // nothing left for it to push.
                    const source: Observable<CallStatsSummary> = day === null ? this.api.streamSummary() : this.api.getSummary(day);
                    // A failed historical fetch must not kill the subscription
                    // for every later selection, so it is swallowed per-request
                    // and surfaces as the "no data" state instead.
                    return source.pipe(catchError(() => of(null as CallStatsSummary | null)));
                })
            )
            .subscribe((summary) => {
                if (summary) {
                    this._summary.set(summary);
                    if (summary.is_current) this._serverToday.set(summary.day);
                }
                this._loading.set(false);
            });
    }

    /** Show a specific day. Formatted with local Y/M/D parts, never
     *  `toISOString()`, which converts to UTC and can hand the backend the
     *  previous date for anyone east of Greenwich. */
    select(date: Date): void {
        this._loading.set(true);
        this.selection$.next(formatDateParam(date));
    }

    /** Back to today, live. */
    selectCurrent(): void {
        this._loading.set(true);
        this.selection$.next(null);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
