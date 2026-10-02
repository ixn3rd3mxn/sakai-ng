import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Subscription, map, switchMap, takeWhile } from 'rxjs';
import { retryUntilReachable } from '@/app/core/retry-until-reachable';
import { IncidentHistoryResponse, IncidentRangeResponse, IncidentRangeSelection, LookupsResponse } from '../incident-history.types';
import { IncidentHistoryApiService } from './incident-history-api.service';
import { StreamEvents } from '@/app/core/sse-reconnect';
import { currentOperationalDay, formatDateParam, parseIsoDate } from '../../dashboardclone/services/date-utils';

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

    // One day (date null = "whatever is current right now" - resolved
    // server-side, never computed here), or several days / a range.
    private readonly request$ = new BehaviorSubject<{ kind: 'day'; date: string | null } | IncidentRangeSelection>({ kind: 'day', date: null });
    private readonly subscription: Subscription;

    private readonly _history = signal<IncidentHistoryResponse | null>(null);
    readonly history = this._history.asReadonly();

    private readonly _lookups = signal<LookupsResponse | null>(null);
    readonly lookups = this._lookups.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    // The source could not be reached for the current request: the day's
    // stream or the range request failed before any answer. The tables say
    // so rather than sitting on a skeleton for good or reading as "nothing
    // recorded". `loading` is left alone, so the rest of the page keeps its
    // skeleton instead of showing the last request's numbers under the new
    // heading. Both keep retrying underneath; once one gets through - the
    // stream connects, or the network comes back for the range - the
    // skeleton is back until the data lands. Nobody has to ask again.
    private readonly _failed = signal<boolean>(false);
    readonly failed = this._failed.asReadonly();
    private readonly connection: StreamEvents = {
        error: () => {
            if (this._loading()) this._failed.set(true);
        },
        // Connected again after failing: back to the skeleton until the
        // first frame, which can take a moment on a heavy request. Before
        // that the message stays up - the retries through an outage are not
        // shown one by one.
        open: () => this._failed.set(false)
    };

    // Set when a range is asked for, not when it arrives: the tables switch
    // to the range columns (as skeletons) at once rather than showing the
    // old day's numbers under range headings.
    private readonly _rangeSelection = signal<IncidentRangeSelection | null>(null);
    readonly rangeSelection = this._rangeSelection.asReadonly();
    readonly isRange = computed(() => this._rangeSelection() !== null);
    private readonly _range = signal<IncidentRangeResponse | null>(null);
    readonly range = this._range.asReadonly();

    readonly context = computed(() => this._history()?.context ?? null);
    readonly isCurrent = computed(() => !this.isRange() && (this.context()?.is_current ?? true));
    // Today as the centre counts it, from the server's clock in whichever
    // answer came last (see currentOperationalDay).
    readonly currentOperationalDay = computed<Date>(() =>
        currentOperationalDay(this.isRange() ? this._range()?.context.server_now : this.context()?.server_now)
    );

    readonly selectedDate = computed<Date>(() => {
        const day = this.context()?.operational_day;
        return day ? parseIsoDate(day) : new Date();
    });

    readonly callTypeOptions = computed(() => (this._lookups()?.call_types ?? []).map((item) => item.name).sort());
    readonly reportingChannelOptions = computed(() => (this._lookups()?.reporting_channels ?? []).map((item) => item.name).sort());
    readonly caseTypeOptions = computed(() => (this._lookups()?.case_types ?? []).map((item) => item.name).sort());
    // Already ordered CBD1 -> CBD25 by the backend (sorted by cbd_id).
    readonly cbdOptions = computed(() => (this._lookups()?.cbd_categories ?? []).map((item) => item.name));
    // Code -> "CBD7 <description>", for display. Incidents carry the bare code
    // (it is what the CBD filter matches on), so the table looks the label up
    // here rather than the backend sending both. Falls back to the code for
    // anything the lookups do not know, "-" included.
    private readonly cbdLabels = computed(() => new Map((this._lookups()?.cbd_categories ?? []).map((item) => [item.name, `${item.name} ${item.des ?? ''}`.trim()])));
    cbdLabel(code: string): string {
        return this.cbdLabels().get(code) ?? code;
    }
    readonly severityOptions = computed(() => (this._lookups()?.severity_levels ?? []).map((item) => item.name).sort());

    constructor() {
        this.api.getLookups().subscribe((lookups) => this._lookups.set(lookups));

        this.subscription = this.request$
            .pipe(
                switchMap((request) =>
                    request.kind === 'day'
                        ? this.api.streamHistory(request.date ?? undefined, this.connection).pipe(
                              // A finished day cannot change, so the connection is
                              // dropped as soon as the server says the day is not
                              // current. The `true` keeps that final frame rather
                              // than discarding the data it carries.
                              takeWhile((snapshot) => snapshot.context.is_current, true),
                              map((snapshot) => ({ day: snapshot }))
                          )
                        : this.api.getRange(request).pipe(
                              // Asked again until it answers, as the day's
                              // stream reconnects; it never errors out, so the
                              // page's one subscription cannot end on it.
                              retryUntilReachable(
                                  () => this._failed.set(true),
                                  () => this._failed.set(false)
                              ),
                              map((range) => ({ range }))
                          )
                )
            )
            .subscribe((result) => {
                if ('day' in result) this._history.set(result.day);
                else this._range.set(result.range);
                this._failed.set(false);
                this._loading.set(false);
            });
    }

    select(date: Date): void {
        this._failed.set(false);
        this._loading.set(true);
        this._rangeSelection.set(null);
        this.request$.next({ kind: 'day', date: formatDateParam(date) });
    }

    // Several days or a range. One day asked for either way is just a day,
    // with the one-day view and its live stream.
    selectRange(selection: IncidentRangeSelection): void {
        const single = selection.kind === 'days' ? (selection.dates.length === 1 ? selection.dates[0] : null) : formatDateParam(selection.from) === formatDateParam(selection.to) ? selection.from : null;
        if (single) return this.select(single);
        this._failed.set(false);
        this._loading.set(true);
        this._rangeSelection.set(selection);
        this.request$.next(selection);
    }

    selectCurrent(): void {
        this._failed.set(false);
        this._loading.set(true);
        this._rangeSelection.set(null);
        this.request$.next({ kind: 'day', date: null });
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
