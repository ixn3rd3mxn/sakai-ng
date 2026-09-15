import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AgentsSummary } from '../agents.types';
import { feedHealthMessage } from '../format-utils';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';
import { resilientEventSource } from '@/app/core/sse-reconnect';

const API_BASE_URL = environment.apiBaseUrl;

// Small enough to keep the transport and the state in one place, unlike the
// call-stats pair - there is no day selection here, just one live roster.
@Injectable()
export class AgentsDataService implements OnDestroy {
    private readonly http = inject(HttpClient);
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    private readonly watchDeploySignals = deploySignalListener();
    private readonly subscription: Subscription;

    private readonly _summary = signal<AgentsSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    readonly agents = computed(() => this._summary()?.agents ?? []);
    readonly counts = computed(() => this._summary()?.counts ?? {});

    /** True only once a payload has arrived and the feed was readable. An
     *  empty roster is a real state ("nobody signed in"); an unreadable feed
     *  is not, and the two must not render the same way.
     *
     *  Stays true while the backend is holding a roster over a failed poll, so
     *  the cards keep their DOM - and their animations - through a blip. */
    readonly hasRoster = computed(() => !this._loading() && (this._summary()?.available ?? false));

    /** The rows on screen are the last good ones and the feed is currently
     *  unreadable. The board keeps showing them and says how old they are. */
    readonly isStale = computed(() => !this._loading() && (this._summary()?.stale ?? false));

    /** The backend's verdict on whether this feed's data can be believed.
     *  Defaults to trusting it, so a backend that predates the field leaves
     *  the board unchanged rather than blanking it. */
    readonly trusted = computed(() => this._summary()?.health?.trusted ?? true);

    /** Short Thai line for the status area, or `''` when the feed is fine. */
    readonly healthMessage = computed(() => (this._loading() ? '' : feedHealthMessage(this._summary()?.health)));

    constructor() {
        this.subscription = this.stream().subscribe((summary) => {
            this._summary.set(summary);
            this._loading.set(false);
        });
    }

    // Pushed only when the roster actually changes, so an unchanged board
    // costs nothing between status flips.
    //
    // Reconnection is not left to the browser: EventSource gives up for good
    // on a response that is not a stream, which is what a backend restart
    // hands it (an edge error page with no CORS header). The shift-handover
    // freeze - roster stuck on 0-2 cards after ERR_HTTP2_PROTOCOL_ERROR and a
    // CORS error - was this. See `resilientEventSource`.
    private stream(): Observable<AgentsSummary> {
        return new Observable<AgentsSummary>((subscriber) => {
            // Runs for every source the helper opens, not only the first: a
            // rebuilt EventSource starts with no listeners.
            return resilientEventSource(`${API_BASE_URL}/agents/stream`, (source) => {
                this.watchDeploySignals(source);
                source.addEventListener('agents', (event: MessageEvent<string>) => {
                    try {
                        subscriber.next(JSON.parse(event.data) as AgentsSummary);
                    } catch {
                        // ignore malformed frames
                    }
                });
            });
        });
    }

    /** One-shot fetch, for callers that do not want a live connection. */
    fetchOnce(): Observable<AgentsSummary> {
        return this.http.get<AgentsSummary>(`${API_BASE_URL}/agents`);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
