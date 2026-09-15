import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { HourlySummary } from '../call-stats.types';
import { feedHealthMessage } from '../format-utils';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';
import { resilientEventSource } from '@/app/core/sse-reconnect';
import { CallStatsDataService } from './call-stats-data.service';

const API_BASE_URL = environment.apiBaseUrl;

/**
 * The hourly chart's data, on its own stream.
 *
 * The buckets used to arrive as a field of the counters' payload, so every
 * board holding the stat rows open fetched the chart's data whether or not
 * the chart was on screen - the wall display, around the clock. Now the
 * chart has its own feed, opened only while its card is on; the backend
 * polls the hourly upstream only while some board has it open.
 *
 * Follows the counters' day selection rather than owning one: the chart has
 * always shown the day the counters show, and a second picker would be two
 * places to get out of step. Today streams (it is still changing, and rolls
 * over at midnight); a finished day is fetched once - there is nothing left
 * for it to push.
 *
 * Provided by the page, not in root, so an open stream is closed when the
 * page is left.
 */
@Injectable()
export class HourlyDataService implements OnDestroy {
    private readonly http = inject(HttpClient);
    private readonly stats = inject(CallStatsDataService);
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    private readonly watchDeploySignals = deploySignalListener();

    private readonly _wanted = signal(false);
    private subscription: Subscription | null = null;

    private readonly _summary = signal<HourlySummary | null>(null);
    readonly summary = this._summary.asReadonly();

    // True until a payload arrives for the *current* selection, and again
    // whenever the card is switched off - a chart switched back on hours
    // later must show a skeleton and then fresh bars, not stale ones that
    // look current.
    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    /** The 24 buckets, or null while loading or when the feed was unreadable. */
    readonly hourly = computed(() => this._summary()?.hourly ?? null);

    /** Short Thai line for the card header, or `''` when the feed is fine. */
    readonly healthMessage = computed(() => (this._loading() ? '' : feedHealthMessage(this._summary()?.health)));

    constructor() {
        // One effect over both inputs: the switch and the selected day. Any
        // change tears down whatever is open and starts over, which is what
        // switchMap does for the counters - re-armed as loading so one day's
        // bars are never shown under another day's date.
        effect((onCleanup) => {
            const wanted = this._wanted();
            const day = this.stats.selection();
            untracked(() => this.open(wanted, day));
            onCleanup(() => this.close());
        });
    }

    /** Open or close the feed. Idempotent; the page calls it from an effect
     *  on the card's switch. */
    setWanted(wanted: boolean): void {
        this._wanted.set(wanted);
    }

    private open(wanted: boolean, day: string | null): void {
        this.close();
        if (!wanted) return;
        const source: Observable<HourlySummary | null> = day === null ? this.stream() : this.fetchDay(day);
        this.subscription = source.subscribe((summary) => {
            this._summary.set(summary);
            this._loading.set(false);
        });
    }

    private close(): void {
        this.subscription?.unsubscribe();
        this.subscription = null;
        this._summary.set(null);
        this._loading.set(true);
    }

    // Reconnection is not left to the browser - see the note in
    // AgentsDataService and the comment on `resilientEventSource`.
    private stream(): Observable<HourlySummary> {
        return new Observable<HourlySummary>((subscriber) => {
            // Runs for every source the helper opens, not only the first: a
            // rebuilt EventSource starts with no listeners.
            return resilientEventSource(`${API_BASE_URL}/call-stats/hourly/stream`, (source) => {
                this.watchDeploySignals(source);
                source.addEventListener('call-stats-hourly', (event: MessageEvent<string>) => {
                    try {
                        subscriber.next(JSON.parse(event.data) as HourlySummary);
                    } catch {
                        // ignore malformed frames
                    }
                });
            });
        });
    }

    // A failed historical fetch surfaces as the "no data" state rather than
    // an error - the same rule the counters follow.
    private fetchDay(day: string): Observable<HourlySummary | null> {
        const params = new HttpParams().set('day', day);
        return this.http.get<HourlySummary>(`${API_BASE_URL}/call-stats/hourly`, { params }).pipe(catchError(() => of(null)));
    }

    ngOnDestroy(): void {
        this.close();
    }
}
