import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { IncidentHistoryResponse, LookupsResponse } from '../incident-history.types';

const API_BASE_URL = 'http://localhost:8000/api';

@Injectable({ providedIn: 'root' })
export class IncidentHistoryApiService {
    private http = inject(HttpClient);

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
