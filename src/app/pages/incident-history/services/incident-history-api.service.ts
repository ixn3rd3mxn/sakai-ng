import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { IncidentHistoryResponse, LookupsResponse } from '../incident-history.types';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';

const API_BASE_URL = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class IncidentHistoryApiService {
    private http = inject(HttpClient);
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    private readonly watchDeploySignals = deploySignalListener();

    private buildParams(date?: string): HttpParams {
        let params = new HttpParams();
        if (date) params = params.set('date', date);
        return params;
    }

    getLookups(): Observable<LookupsResponse> {
        return this.http.get<LookupsResponse>(`${API_BASE_URL}/lookups`);
    }

    getHistory(date?: string): Observable<IncidentHistoryResponse> {
        return this.http.get<IncidentHistoryResponse>(`${API_BASE_URL}/incident-history`, { params: this.buildParams(date) });
    }

    // Backend re-pushes the "incident-history" event only when the payload
    // actually changes (see backend/main.py:stream_incident_history) - the
    // caller decides whether to open this at all (only while viewing today).
    streamHistory(date?: string): Observable<IncidentHistoryResponse> {
        return new Observable<IncidentHistoryResponse>((subscriber) => {
            const query = this.buildParams(date).toString();
            const url = query ? `${API_BASE_URL}/incident-history/stream?${query}` : `${API_BASE_URL}/incident-history/stream`;
            const source = new EventSource(url);
            this.watchDeploySignals(source);

            source.addEventListener('incident-history', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as IncidentHistoryResponse);
                } catch {
                    // ignore malformed frames
                }
            });

            source.onerror = () => {};

            return () => source.close();
        });
    }
}
