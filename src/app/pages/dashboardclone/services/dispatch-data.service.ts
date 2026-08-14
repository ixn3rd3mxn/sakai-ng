import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Subscription, switchMap } from 'rxjs';
import { DashboardSummary, IncidentCreateRequest, ShiftCode } from '../dispatch.types';
import { DispatchApiService } from './dispatch-api.service';
import { formatDateParam, parseIsoDate } from './date-utils';

interface Selection {
    date: string | null;
    shift: ShiftCode | null;
}

// Owns the one operational-day/shift selection for the whole dashboard, and
// the live summary that selection resolves to. Every widget, the action
// dial, and the "viewing historical data" banner all read from this same
// instance (provided once on the dashboard route component) instead of each
// tracking date/shift state on their own.
@Injectable()
export class DispatchDataService implements OnDestroy {
    private readonly api = inject(DispatchApiService);

    // `{ date: null, shift: null }` means "whatever is current right now" -
    // resolved server-side, never computed here.
    private readonly selection$ = new BehaviorSubject<Selection>({ date: null, shift: null });
    private readonly subscription: Subscription;

    private readonly _summary = signal<DashboardSummary | null>(null);
    readonly summary = this._summary.asReadonly();

    readonly context = computed(() => this._summary()?.context ?? null);
    readonly isCurrent = computed(() => this.context()?.is_current ?? true);
    readonly selectedShift = computed<ShiftCode>(() => this.context()?.shift ?? 'morning');
    readonly selectedDate = computed<Date>(() => {
        const day = this.context()?.operational_day;
        return day ? parseIsoDate(day) : new Date();
    });

    constructor() {
        this.subscription = this.selection$.pipe(switchMap((selection) => this.api.streamSummary(selection.date ?? undefined, selection.shift ?? undefined))).subscribe((summary) => this._summary.set(summary));
    }

    select(date: Date, shift: ShiftCode): void {
        this.selection$.next({ date: formatDateParam(date), shift });
    }

    selectCurrent(): void {
        this.selection$.next({ date: null, shift: null });
    }

    createIncident(body: IncidentCreateRequest) {
        return this.api.createIncident(body);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
