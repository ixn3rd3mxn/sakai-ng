import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Subscription, switchMap, takeWhile } from 'rxjs';
import { IncidentHistoryResponse, LookupsResponse } from '../incident-history.types';
import { IncidentHistoryApiService } from './incident-history-api.service';
import { formatDateParam, parseIsoDate } from '../../dashboardclone/services/date-utils';

// Owns the single date selection for the incident history page and the live
// snapshot that selection resolves to. Every selection opens the stream
// directly: its first frame is byte-for-byte the payload the plain GET used
// to return - same aggregation, same shape - so fetching both meant running
// the heaviest query in the app (a 30-branch $facet plus a full-month scan)
// twice per page load for one screen of data. `is_current` arrives in that
// first frame too, which is all the GET was really being kept for, so a
// historical day still never holds a live connection - it just closes the
// stream after the first frame instead of never opening one.
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
                    this.api.streamHistory(dateParam ?? undefined).pipe(
                        // A finished day cannot change, so the connection is
                        // dropped as soon as the server says the day is not
                        // current. The `true` keeps that final frame rather
                        // than discarding the data it carries.
                        takeWhile((snapshot) => snapshot.context.is_current, true)
                    )
                )
            )
            .subscribe((snapshot) => {
                this._history.set(snapshot);
                this._loading.set(false);
            });    }

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
