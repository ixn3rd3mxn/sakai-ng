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
import { OptionGroup } from '../../../shared/recent-picks';
import { FloodApiService } from './flood-api.service';

// Mirrors REPORTER_SHORTCUTS / DDPM_SHORTCUTS / CREW_SHORTCUTS in
// backend/libs/flood_cases.py. Change both together.
const REPORTER_SHORTCUTS: string[] = ['กู้ชีพ', 'จนท.', 'ทต.', 'รพ.', 'รพ.สต.', 'ศูนย์', 'สภ.', 'อบต.', 'เทศบาล'];
const DDPM_SHORTCUTS: string[] = ['กอ.ร่วม', 'ประสาน', 'ประสานกู้ชีพ', 'ประสานงานทีมปภ.อำเภอ'];
const CREW_SHORTCUTS: string[] = ['กู้ชีพ', 'ทต.', 'เทศบาล', 'รพ.', 'รพ.สต.', 'ศูนย์', 'อบต.'];

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
    // Whether the one lookups request is still out. Every dropdown on the
    // page is empty until it lands, so the intake form waits on this the
    // same way it waits on a case.
    private readonly _lookupsPending = signal(true);
    readonly lookupsPending = this._lookupsPending.asReadonly();

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
    // The badges are fixed text, not data: the same lists as
    // backend/libs/flood_cases.py, so they are on screen before /lookups
    // answers (a case opened by link on a cold page shows its skeleton
    // while both are in flight). The server's copy still replaces them.
    readonly reporterShortcuts = computed(() => this._lookups()?.reporter_shortcuts ?? REPORTER_SHORTCUTS);
    readonly ddpmShortcuts = computed(() => this._lookups()?.ddpm_shortcuts ?? DDPM_SHORTCUTS);
    readonly crewShortcuts = computed(() => this._lookups()?.crew_shortcuts ?? CREW_SHORTCUTS);
    readonly notifiers = computed(() => this._lookups()?.notifiers ?? []);
    readonly ddpmTeams = computed(() => this._lookups()?.ddpm_teams ?? []);
    readonly crews = computed(() => this._lookups()?.crews ?? []);

    // Options for the amphoe/tambon pair. Kept here rather than in the form so
    // the table's amphoe filter and the drawer's dropdown read the same list.
    readonly districtOptions = computed(() =>
        this.districts().map((d) => ({ label: d.district_name, value: d.district_code }))
    );

    // Tambon, one group per amphoe in the amphoe list's order. Tambon names
    // repeat across amphoe, so the group header is what tells two "บ้านใหม่"
    // apart when the whole province is listed.
    private readonly subdistrictGroups = computed(() => {
        const byDistrict = new Map(this.districts().map((d) => [d.district_code, { label: d.district_name, items: [] as { label: string; value: string }[] }]));
        for (const s of this.subdistricts()) {
            byDistrict.get(s.district_code)?.items.push({ label: s.subdistrict_name, value: s.subdistrict_code });
        }
        return [...byDistrict.entries()].filter(([, group]) => group.items.length).map(([code, group]) => ({ code, ...group }));
    });

    subdistrictGroupsFor(districtCode: string | null | undefined): OptionGroup<{ label: string; value: string }>[] {
        // No amphoe chosen yet: offer every tambon rather than nothing, so an
        // operator who was told the tambon but not the amphoe can start there.
        const groups = this.subdistrictGroups();
        return districtCode ? groups.filter((g) => g.code === districtCode) : groups;
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
        this.api.getLookups().subscribe({
            next: (lookups) => {
                this._lookups.set(lookups);
                this._lookupsPending.set(false);
            },
            // A failure has to end the wait too, or every dropdown that shows
            // a placeholder while these are in flight waits for ever.
            error: () => this._lookupsPending.set(false)
        });

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
        // Same comparison as the distinctUntilChanged below. If the pipe is
        // going to drop this emission, loading must not be raised either, or
        // nothing ever answers to lower it and the skeleton stays up for good
        // (clearing the date picker after choosing only a start date did this).
        if (JSON.stringify(next) === JSON.stringify(this.filters$.value)) return;
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

    // The three shapes the date control produces. Each one clears the other
    // two, so the state can never say "1st to 30th" and "the 4th" at once.
    setDay(day: Date | null): void {
        const iso = day ? formatDateParam(day) : null;
        this.patch({ dateFrom: iso, dateTo: iso, dates: [] });
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
            dateTo: to ? formatDateParam(to) : null,
            dates: []
        });
    }

    setDates(days: Date[] | null): void {
        const dates = (days ?? []).map(formatDateParam).sort();
        this.patch({ dateFrom: null, dateTo: null, dates });
    }

    setDistrict(districtCode: string | null): void {
        this.patch({ districtCode });
    }

    setShift(shift: FloodShift | null): void {
        this.patch({ shift });
    }

    setAgent(agentId: string | null): void {
        this.patch({ agentId });
    }

    clearFilters(): void {
        this.patch({ ...EMPTY_FILTERS });
    }

    readonly hasActiveFilters = computed(() => {
        const f = this._filters();
        return !!(f.search || f.dateFrom || f.dateTo || f.dates.length || f.districtCode || f.shift || f.agentId || f.tab !== 'all');
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
