import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
    FloodCase,
    FloodCaseInput,
    FloodCasesResponse,
    FloodDuplicateResponse,
    FloodFilterState,
    FloodLookupsResponse
} from '../flood-intake.types';

const API_BASE_URL = environment.apiBaseUrl;

// Transport only. Every decision about *what* to ask for lives in
// FloodDataService; this file just knows how to ask - the same split the
// incident-history page uses.
@Injectable({ providedIn: 'root' })
export class FloodApiService {
    private http = inject(HttpClient);

    // Built in one place so the table, the SSE stream and the export all
    // describe the same set of rows. An export that quietly covered more than
    // the screen showed would only be noticed after the file was sent on.
    private buildParams(filters: FloodFilterState): HttpParams {
        let params = new HttpParams().set('tab', filters.tab);
        if (filters.search) params = params.set('search', filters.search);
        if (filters.dateFrom) params = params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params = params.set('date_to', filters.dateTo);
        if (filters.districtCode) params = params.set('district_code', filters.districtCode);
        if (filters.shift) params = params.set('shift', filters.shift);
        if (filters.agentName) params = params.set('agent_name', filters.agentName);
        return params;
    }

    getLookups(): Observable<FloodLookupsResponse> {
        return this.http.get<FloodLookupsResponse>(`${API_BASE_URL}/flood-lookups`);
    }

    getCases(filters: FloodFilterState): Observable<FloodCasesResponse> {
        return this.http.get<FloodCasesResponse>(`${API_BASE_URL}/flood-cases`, { params: this.buildParams(filters) });
    }

    // The backend re-pushes "flood-cases" only when the payload actually
    // changes, so an idle connection costs nothing. This has to stay open
    // while the page is up: several operators take calls at once, and the
    // duplicate check only works if each can see what the others just wrote.
    streamCases(filters: FloodFilterState): Observable<FloodCasesResponse> {
        return new Observable<FloodCasesResponse>((subscriber) => {
            const query = this.buildParams(filters).toString();
            const source = new EventSource(`${API_BASE_URL}/flood-cases/stream?${query}`);

            source.addEventListener('flood-cases', (event: MessageEvent<string>) => {
                try {
                    subscriber.next(JSON.parse(event.data) as FloodCasesResponse);
                } catch {
                    // ignore malformed frames
                }
            });

            // EventSource reconnects on its own; surfacing the error would
            // only flash a warning during a blip that has already healed.
            source.onerror = () => {};

            return () => source.close();
        });
    }

    getCase(caseId: string): Observable<{ case: FloodCase }> {
        return this.http.get<{ case: FloodCase }>(`${API_BASE_URL}/flood-cases/${caseId}`);
    }

    createCase(body: FloodCaseInput): Observable<{ case: FloodCase }> {
        return this.http.post<{ case: FloodCase }>(`${API_BASE_URL}/flood-cases`, body);
    }

    updateCase(caseId: string, body: FloodCaseInput): Observable<{ case: FloodCase }> {
        return this.http.patch<{ case: FloodCase }>(`${API_BASE_URL}/flood-cases/${caseId}`, body);
    }

    // Status-only, deliberately not the full-form endpoint: the table row
    // holds a snapshot that may already be stale, and resending all nineteen
    // fields from it could overwrite what somebody else is typing right now.
    setStatus(caseId: string, status: string): Observable<{ case: FloodCase }> {
        return this.http.patch<{ case: FloodCase }>(`${API_BASE_URL}/flood-cases/${caseId}/status`, { status });
    }

    bulkSetStatus(caseIds: string[], status: string): Observable<{ updated: number }> {
        return this.http.post<{ updated: number }>(`${API_BASE_URL}/flood-cases/bulk-status`, {
            case_ids: caseIds,
            status
        });
    }

    checkDuplicates(params: {
        phone?: string | null;
        subdistrictCode?: string | null;
        locationNote?: string | null;
        exclude?: string | null;
    }): Observable<FloodDuplicateResponse> {
        let query = new HttpParams();
        if (params.phone) query = query.set('phone', params.phone);
        if (params.subdistrictCode) query = query.set('subdistrict_code', params.subdistrictCode);
        if (params.locationNote) query = query.set('location_note', params.locationNote);
        if (params.exclude) query = query.set('exclude', params.exclude);
        return this.http.get<FloodDuplicateResponse>(`${API_BASE_URL}/flood-cases/duplicate-check`, { params: query });
    }

    // A plain URL rather than a fetch: the file is streamed straight to the
    // browser's downloader, so a large export never has to be held in memory
    // here first.
    exportUrl(filters: FloodFilterState): string {
        return `${API_BASE_URL}/flood-cases/export?${this.buildParams(filters).toString()}`;
    }
}
