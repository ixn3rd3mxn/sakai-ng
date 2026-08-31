import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CallLogSummary } from '../call-log.types';

const API_BASE_URL = environment.apiBaseUrl;

// Same shape as AgentsDataService: transport and state in one place, since
// there is no day selection here - just today's two logs.
@Injectable()
export class CallLogDataService implements OnDestroy {
    private readonly http = inject(HttpClient);
    private readonly subscription: Subscription;

    private readonly _summary = signal<CallLogSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    readonly calls = computed(() => this._summary()?.calls ?? []);
    readonly missed = computed(() => this._summary()?.missed ?? []);

    // Per-feed, because the two fail independently. Each is true only once a
    // payload has arrived AND that feed was readable, so an empty table can be
    // told apart from one that never loaded.
    readonly callsAvailable = computed(() => !this._loading() && (this._summary()?.calls_available ?? false));
    readonly missedAvailable = computed(() => !this._loading() && (this._summary()?.missed_available ?? false));

    constructor() {
        this.subscription = this.stream().subscribe((summary) => {
            this._summary.set(summary);
            this._loading.set(false);
        });
    }

    // Pushed only when either log actually changes. The backend polls every
    // 20s but re-broadcasts nothing unless the payload differs, so a quiet
    // evening costs one connection and no frames.
    private stream(): Observable<CallLogSummary> {
        return new Observable<CallLogSummary>((subscriber) => {
            const source = new EventSource(`${API_BASE_URL}/call-log/stream`);
            source.addEventListener('call-log', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as CallLogSummary);
                } catch {
                    // ignore malformed frames
                }
            });
            source.onerror = () => {}; // EventSource retries on its own
            return () => source.close();
        });
    }

    /** One-shot fetch, for callers that do not want a live connection. */
    fetchOnce(): Observable<CallLogSummary> {
        return this.http.get<CallLogSummary>(`${API_BASE_URL}/call-log`);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
