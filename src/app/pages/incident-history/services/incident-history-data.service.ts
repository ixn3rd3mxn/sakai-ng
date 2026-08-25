import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, EMPTY, Subscription, switchMap, tap } from 'rxjs';
import { IncidentHistoryResponse, LookupsResponse } from '../incident-history.types';
import { IncidentHistoryApiService } from './incident-history-api.service';
import { formatDateParam, parseIsoDate } from '../../dashboardclone/services/date-utils';

// Owns the single date selection for the incident history page and the live
// snapshot that selection resolves to. Every selection does one plain GET
// first (fast paint, and the source of truth for whether the picked day is
// actually "current"); only when the server confirms `is_current` does this
// open the SSE stream, so a historical day never gets a live connection.
@Injectable()
export class IncidentHistoryDataService implements OnDestroy {
    private readonly api = inject(IncidentHistoryApiService);

    // null = "whatever is current right now" - resolved server-side, never
    // computed here.
    private readonly selectedDateParam$ = new BehaviorSubject<string | null>(null);
    private readonly subscription: Subscription;

    private readonly _history = signal<IncidentHistoryResponse | null>(null);
    readonly history = this._history.asReadonly();

    private readonly _lookups = signal<LookupsResponse | null>(null);
    readonly lookups = this._lookups.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    readonly context = computed(() => this._history()?.context ?? null);
    readonly isCurrent = computed(() => this.context()?.is_current ?? true);
    readonly selectedDate = computed<Date>(() => {
        const day = this.context()?.operational_day;
        return day ? parseIsoDate(day) : new Date();
    });

    readonly callTypeOptions = computed(() => (this._lookups()?.call_types ?? []).map((item) => item.name).sort());
    readonly reportingChannelOptions = computed(() => (this._lookups()?.reporting_channels ?? []).map((item) => item.name).sort());
    readonly caseTypeOptions = computed(() => (this._lookups()?.case_types ?? []).map((item) => item.name).sort());
    // Already ordered CBD1 -> CBD25 by the backend (sorted by cbd_id).
    readonly cbdOptions = computed(() => (this._lookups()?.cbd_categories ?? []).map((item) => item.name));
    readonly severityOptions = computed(() => (this._lookups()?.severity_levels ?? []).map((item) => item.name).sort());

    constructor() {
        this.api.getLookups().subscribe((lookups) => this._lookups.set(lookups));

        this.subscription = this.selectedDateParam$
            .pipe(
                switchMap((dateParam) =>
                    this.api.getHistory(dateParam ?? undefined).pipe(
                        tap((snapshot) => {
                            this._history.set(snapshot);
                            this._loading.set(false);
                        }),
                        switchMap((snapshot) => (snapshot.context.is_current ? this.api.streamHistory(dateParam ?? undefined) : EMPTY))
                    )
                )
            )
            .subscribe((snapshot) => this._history.set(snapshot));
    }

    select(date: Date): void {
        this._loading.set(true);
        this.selectedDateParam$.next(formatDateParam(date));
    }

    selectCurrent(): void {
        this._loading.set(true);
        this.selectedDateParam$.next(null);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
