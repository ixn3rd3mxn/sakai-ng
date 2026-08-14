import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardSummary, IncidentCreateRequest, IncidentCreateResponse, OperationalContext, ShiftCode } from '../dispatch.types';

const API_BASE_URL = 'http://localhost:8000/api';

@Injectable({ providedIn: 'root' })
export class DispatchApiService {
    private http = inject(HttpClient);

    private buildParams(date?: string, shift?: ShiftCode): HttpParams {
        let params = new HttpParams();
        if (date) params = params.set('date', date);
        if (shift) params = params.set('shift', shift);
        return params;
    }

    getContext(date?: string, shift?: ShiftCode): Observable<OperationalContext> {
        return this.http.get<OperationalContext>(`${API_BASE_URL}/context`, { params: this.buildParams(date, shift) });
    }

    getSummary(date?: string, shift?: ShiftCode): Observable<DashboardSummary> {
        return this.http.get<DashboardSummary>(`${API_BASE_URL}/dashboard/summary`, { params: this.buildParams(date, shift) });
    }

    // Backend re-pushes the "dashboard" event whenever the aggregated
    // payload actually changes (see backend/main.py:stream_summary), so the
    // frontend only ever has to render whatever arrives - no client-side
    // polling or refresh logic needed.
    streamSummary(date?: string, shift?: ShiftCode): Observable<DashboardSummary> {
        return new Observable<DashboardSummary>((subscriber) => {
            const query = this.buildParams(date, shift).toString();
            const url = query ? `${API_BASE_URL}/dashboard/stream?${query}` : `${API_BASE_URL}/dashboard/stream`;
            const source = new EventSource(url);

            source.addEventListener('dashboard', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as DashboardSummary);
                } catch {
                    // ignore malformed frames
                }
            });

            // EventSource retries the connection on its own; nothing to do here.
            source.onerror = () => {};

            return () => source.close();
        });
    }

    createIncident(body: IncidentCreateRequest): Observable<IncidentCreateResponse> {
        return this.http.post<IncidentCreateResponse>(`${API_BASE_URL}/incidents`, body);
    }
}
