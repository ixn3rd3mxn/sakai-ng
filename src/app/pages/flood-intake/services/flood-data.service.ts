import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { formatDateParam } from '../../dashboardclone/services/date-utils';
import {
    EMPTY_FILTERS,
    FloodCase,
    FloodCasesResponse,
    FloodFilterState,
    FloodLookupsResponse,
    FloodShift,
    FloodTab
} from '../flood-intake.types';
import { FloodApiService } from './flood-api.service';

// Owns the filter selection and the live snapshot it resolves to.
//
// Every filter is applied server-side and the selection re-opens the stream,
// exactly as the incident-history page does. Filtering in the browser instead
// would only ever search the rows already loaded, and the whole point of the
// search box is finding a case somebody else took twenty minutes ago - which
// during a flood is well past the end of the loaded window.
@Injectable()
export class FloodDataService implements OnDestroy {
    private readonly api = inject(FloodApiService);

    private readonly filters$ = new BehaviorSubject<FloodFilterState>({ ...EMPTY_FILTERS });
    private readonly subscription: Subscription;

    private readonly _snapshot = signal<FloodCasesResponse | null>(null);
    readonly snapshot = this._snapshot.asReadonly();

    private readonly _lookups = signal<FloodLookupsResponse | null>(null);
    readonly lookups = this._lookups.asReadonly();

    private readonly _loading = signal<boolean>(true);
    readonly loading = this._loading.asReadonly();

    private readonly _filters = signal<FloodFilterState>({ ...EMPTY_FILTERS });
    readonly filters = this._filters.asReadonly();

    readonly cases = computed<FloodCase[]>(() => this._snapshot()?.cases ?? []);
    readonly total = computed(() => this._snapshot()?.total ?? 0);
    readonly offset = computed(() => this._snapshot()?.offset ?? 0);
    readonly truncated = computed(() => this._snapshot()?.truncated ?? false);
    readonly counts = computed(() => this._snapshot()?.counts ?? null);
    readonly context = computed(() => this._snapshot()?.context ?? null);

    readonly districts = computed(() => this._lookups()?.districts ?? []);
    readonly subdistricts = computed(() => this._lookups()?.subdistricts ?? []);
    readonly agents = computed(() => this._lookups()?.agents ?? []);
    readonly channels = computed(() => this._lookups()?.channels ?? []);
    readonly genders = computed(() => this._lookups()?.genders ?? []);
    readonly shifts = computed(() => this._lookups()?.shifts ?? []);
    readonly reporterShortcuts = computed(() => this._lookups()?.reporter_shortcuts ?? []);

    // Options for the amphoe/tambon pair. Kept here rather than in the form so
    // the table's amphoe filter and the drawer's dropdown read the same list.
    readonly districtOptions = computed(() =>
        this.districts().map((d) => ({ label: d.district_name, value: d.district_code }))
    );

    subdistrictOptionsFor(districtCode: string | null | undefined) {
        if (!districtCode) return [];
        return this.subdistricts()
            .filter((s) => s.district_code === districtCode)
            .map((s) => ({ label: s.subdistrict_name, value: s.subdistrict_code }));
    }

    subdistrictByCode(code: string | null | undefined) {
        if (!code) return null;
        return this.subdistricts().find((s) => s.subdistrict_code === code) ?? null;
    }

    districtByCode(code: string | null | undefined) {
        if (!code) return null;
        return this.districts().find((d) => d.district_code === code) ?? null;
    }

    constructor() {
        this.api.getLookups().subscribe((lookups) => this._lookups.set(lookups));

        this.subscription = this.filters$
            .pipe(
                // One debounce for every filter, not just the search box. A
                // keystroke must not tear down and rebuild the EventSource,
                // and 250ms is imperceptible on a dropdown.
                debounceTime(250),
                distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
                switchMap((filters) => this.api.streamCases(filters))
            )
            .subscribe((snapshot) => {
                this._snapshot.set(snapshot);
                this._loading.set(false);
            });
    }

    private patch(change: Partial<FloodFilterState>): void {
        const next = { ...this.filters$.value, ...change };
        this._filters.set(next);
        this._loading.set(true);
        this.filters$.next(next);
    }

    setTab(tab: FloodTab): void {
        this.patch({ tab });
    }

    setSearch(search: string): void {
        this.patch({ search: search ?? '' });
    }

    setDateRange(range: Date[] | null): void {
        // p-datepicker in range mode reports [from, null] while the operator
        // is mid-selection; applying that as an open-ended range would blank
        // the table between the two clicks.
        const from = range?.[0] ?? null;
        const to = range?.[1] ?? null;
        if (from && !to) return;
        this.patch({
            dateFrom: from ? formatDateParam(from) : null,
            dateTo: to ? formatDateParam(to) : null
        });
    }

    setDistrict(districtCode: string | null): void {
        this.patch({ districtCode });
    }

    setShift(shift: FloodShift | null): void {
        this.patch({ shift });
    }

    setAgent(agentName: string | null): void {
        this.patch({ agentName });
    }

    clearFilters(): void {
        this.patch({ ...EMPTY_FILTERS });
    }

    readonly hasActiveFilters = computed(() => {
        const f = this._filters();
        return !!(f.search || f.dateFrom || f.dateTo || f.districtCode || f.shift || f.agentName || f.tab !== 'all');
    });

    exportUrl(): string {
        return this.api.exportUrl(this.filters$.value);
    }

    // Applied optimistically by the caller and then confirmed by the stream:
    // the backend notifies every open connection on write, so the authoritative
    // row arrives within a second without this having to merge it by hand.
    setStatus(caseId: string, status: string) {
        return this.api.setStatus(caseId, status);
    }

    bulkSetStatus(caseIds: string[], status: string) {
        return this.api.bulkSetStatus(caseIds, status);
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }
}
