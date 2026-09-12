import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DashboardSummary, IncidentCreateRequest, IncidentCreateResponse, OperationalContext, ShiftCode } from '../dispatch.types';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';
import { resilientEventSource } from '@/app/core/sse-reconnect';

const API_BASE_URL = environment.apiBaseUrl;

@Injectable({ providedIn: 'root' })
export class DispatchApiService {
    private http = inject(HttpClient);
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    private readonly watchDeploySignals = deploySignalListener();

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
    //
    // Reconnection, though, is not left to the browser. EventSource retries a
    // dropped socket on its own, but gives up permanently on a response that
    // is not a stream - and a backend cold-start hands it exactly that, an
    // edge error page with no CORS header. The wall monitor froze on a stale
    // total for a whole night that way. `resilientEventSource` treats that
    // terminal state as one more thing to retry; see its comment for the
    // console trace that led here.
    streamSummary(date?: string, shift?: ShiftCode): Observable<DashboardSummary> {
        return new Observable<DashboardSummary>((subscriber) => {
            const query = this.buildParams(date, shift).toString();
            const url = query ? `${API_BASE_URL}/dashboard/stream?${query}` : `${API_BASE_URL}/dashboard/stream`;

            // Runs for every source the helper opens, not only the first: a
            // rebuilt EventSource starts with no listeners, so the deploy
            // signals and the data handler have to be attached again each
            // time.
            return resilientEventSource(url, (source) => {
                this.watchDeploySignals(source);
                source.addEventListener('dashboard', (event: MessageEvent<string>) => {
                    try {
                        subscriber.next(JSON.parse(event.data) as DashboardSummary);
                    } catch {
                        // ignore malformed frames
                    }
                });
            });
        });
    }

    createIncident(body: IncidentCreateRequest): Observable<IncidentCreateResponse> {
        return this.http.post<IncidentCreateResponse>(`${API_BASE_URL}/incidents`, body);
    }
}
