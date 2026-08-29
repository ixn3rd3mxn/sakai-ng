import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AgentsSummary } from '../agents.types';

const API_BASE_URL = environment.apiBaseUrl;

// Small enough to keep the transport and the state in one place, unlike the
// call-stats pair - there is no day selection here, just one live roster.
@Injectable()
export class AgentsDataService implements OnDestroy {
    private readonly http = inject(HttpClient);
    private readonly subscription: Subscription;

    private readonly _summary = signal<AgentsSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    readonly agents = computed(() => this._summary()?.agents ?? []);
    readonly counts = computed(() => this._summary()?.counts ?? {});

    /** True only once a payload has arrived and the feed was readable. An
     *  empty roster is a real state ("nobody signed in"); an unreadable feed
     *  is not, and the two must not render the same way. */
    readonly hasRoster = computed(() => !this._loading() && (this._summary()?.available ?? false));

    constructor() {
        this.subscription = this.stream().subscribe((summary) => {
            this._summary.set(summary);
            this._loading.set(false);
        });
    }

    // Pushed only when the roster actually changes, so an unchanged board
    // costs nothing between status flips.
    private stream(): Observable<AgentsSummary> {
        return new Observable<AgentsSummary>((subscriber) => {
            const source = new EventSource(`${API_BASE_URL}/agents/stream`);
            source.addEventListener('agents', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as AgentsSummary);
                } catch {
                    // ignore malformed frames
                }
            });
            source.onerror = () => {}; // EventSource retries on its own
            return () => source.close();
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
