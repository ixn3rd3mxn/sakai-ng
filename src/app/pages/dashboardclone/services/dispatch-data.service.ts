import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, EMPTY, Subscription, catchError, map, switchMap } from 'rxjs';
import { DashboardRangeSummary, DashboardSummary, IncidentCreateRequest, ShiftCode } from '../dispatch.types';
import { IncidentRangeSelection } from '../../incident-history/incident-history.types';
import { DispatchApiService } from './dispatch-api.service';
import { currentOperationalDay, formatDateParam, parseIsoDate } from './date-utils';

interface Selection {
    date: string | null;
    shift: ShiftCode | null;
}

// Owns the one operational-day/shift selection for the whole dashboard, and
// the live summary that selection resolves to. Every widget, the action
// dial, and the "viewing historical data" banner all read from this same
// instance (provided once on the dashboard route component) instead of each
// tracking date/shift state on their own.
//
// Or, instead of one shift, several days or a range: the same widgets summed
// over them (see `board`), fetched once rather than streamed - the days asked
// about are finished.
@Injectable()
export class DispatchDataService implements OnDestroy {
    private readonly api = inject(DispatchApiService);

    // `{ date: null, shift: null }` means "whatever is current right now" -
    // resolved server-side, never computed here.
    private readonly request$ = new BehaviorSubject<({ kind: 'shift' } & Selection) | IncidentRangeSelection>({ kind: 'shift', date: null, shift: null });
    private readonly subscription: Subscription;

    private readonly _summary = signal<DashboardSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    // Set when a range is asked for, not when it arrives, so the page swaps
    // to the range layout (as skeletons) at once rather than showing the old
    // shift's numbers under a range heading.
    private readonly _rangeSelection = signal<IncidentRangeSelection | null>(null);
    readonly rangeSelection = this._rangeSelection.asReadonly();
    readonly isRange = computed(() => this._rangeSelection() !== null);
    private readonly _range = signal<DashboardRangeSummary | null>(null);
    readonly range = this._range.asReadonly();

    // What the widgets draw: the shift's summary, or the range's - the same
    // shapes either way.
    readonly board = computed<Omit<DashboardSummary, 'context'> | null>(() => (this.isRange() ? this._range() : this._summary()));

    // True until the stream has delivered a snapshot for the current
    // selection. Without it the widgets render `?? 0` / `?? []` defaults,
    // which on this page is not an empty state but a wrong one: every
    // counter reads 0 and the recent-incidents table states that nothing has
    // been recorded. Switching shift re-arms it, so a stale shift's numbers
    // are never shown under a new shift's heading either.
    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    readonly context = computed(() => this._summary()?.context ?? null);
    readonly isCurrent = computed(() => !this.isRange() && (this.context()?.is_current ?? true));
    readonly selectedShift = computed<ShiftCode>(() => this.context()?.shift ?? 'morning');
    readonly selectedDate = computed<Date>(() => {
        const day = this.context()?.operational_day;
        return day ? parseIsoDate(day) : new Date();
    });

    // Today as the centre counts it, from the server's clock in whichever
    // answer came last (see currentOperationalDay).
    readonly currentOperationalDay = computed<Date>(() =>
        currentOperationalDay(this.isRange() ? this._range()?.context.server_now : this.context()?.server_now)
    );

    constructor() {
        this.subscription = this.request$
            .pipe(
                switchMap((request) =>
                    request.kind === 'shift'
                        ? this.api.streamSummary(request.date ?? undefined, request.shift ?? undefined).pipe(map((summary) => ({ summary })))
                        : this.api.getSummaryRange(request).pipe(
                              map((range) => ({ range })),
                              // A failed request must not end the page's one
                              // subscription; the skeletons just come down.
                              catchError(() => {
                                  this._loading.set(false);
                                  return EMPTY;
                              })
                          )
                )
            )
            .subscribe((result) => {
                if ('summary' in result) this._summary.set(result.summary);
                else this._range.set(result.range);
                this._loading.set(false);
            });
    }

    select(date: Date, shift: ShiftCode): void {
        this._loading.set(true);
        this._rangeSelection.set(null);
        this.request$.next({ kind: 'shift', date: formatDateParam(date), shift });
    }

    // Several days or a range. One day asked for that way is still several
    // days' worth of board - all three shifts - so it stays a range here;
    // only วันเดียว with a shift is the shift board.
    selectRange(selection: IncidentRangeSelection): void {
        this._loading.set(true);
        this._rangeSelection.set(selection);
        this.request$.next(selection);
    }

    selectCurrent(): void {
        this._loading.set(true);
        this._rangeSelection.set(null);
        this.request$.next({ kind: 'shift', date: null, shift: null });
    }

    createIncident(body: IncidentCreateRequest) {
        return this.api.createIncident(body);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
