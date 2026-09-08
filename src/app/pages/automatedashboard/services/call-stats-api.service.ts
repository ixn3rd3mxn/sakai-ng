import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CallStatsSummary } from '../call-stats.types';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';

const API_BASE_URL = environment.apiBaseUrl;

// `day` is sent as a plain `YYYY-MM-DD`, never as an epoch range: the backend
// turns it into one with `day_epoch_window`, the same tested function that
// resolves "today". Omitting it means "whatever today is in Bangkok", which
// the browser must not decide - its clock and timezone are not the dispatch
// centre's.
@Injectable({ providedIn: 'root' })
export class CallStatsApiService {
    private http = inject(HttpClient);
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    private readonly watchDeploySignals = deploySignalListener();

    getSummary(day?: string): Observable<CallStatsSummary> {
        const params = day ? new HttpParams().set('day', day) : undefined;
        return this.http.get<CallStatsSummary>(`${API_BASE_URL}/call-stats/summary`, { params });
    }

    // Today only, deliberately: this streams whatever the current Bangkok day
    // is, and re-pushes when the payload changes - including at midnight,
    // which is what swaps the widget onto the new day. A past day is finished
    // and can never change, so it is fetched once with `getSummary` instead;
    // subscribing to one would mean a single frame and then silence forever.
    streamSummary(): Observable<CallStatsSummary> {
        return new Observable<CallStatsSummary>((subscriber) => {
            const source = new EventSource(`${API_BASE_URL}/call-stats/stream`);
            this.watchDeploySignals(source);

            source.addEventListener('call-stats', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as CallStatsSummary);
                } catch {
                    // ignore malformed frames
                }
            });

            // EventSource retries the connection on its own; nothing to do here.
            source.onerror = () => {};

            return () => source.close();
        });
    }
}
