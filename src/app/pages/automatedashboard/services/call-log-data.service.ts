import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CallLogSummary, CallsSummary, MissedCallsSummary } from '../call-log.types';
import { liveTableFeed } from './live-table-feed';

const API_BASE_URL = environment.apiBaseUrl;

// One service per table, on two streams, where there used to be one service
// carrying both over one connection. The split is what makes the card
// switches mean something: the abandoned feed upstream takes ~2.4s a read,
// and a wall display that never scrolls down to that table was keeping it
// polled around the clock. Each table now opens its own stream only while its
// card is on - see the page component.
//
// Both are provided by the page, not in root, so a stream that is open is
// closed when the page is left rather than living for the whole app session.

/** ประวัติการรับสาย - the answered-call table. */
@Injectable()
export class CallLogDataService implements OnDestroy {
    private readonly http = inject(HttpClient);
    private readonly feed = liveTableFeed<CallsSummary>(`${API_BASE_URL}/call-log/calls/stream`, 'call-log-calls');

    readonly summary = this.feed.summary;
    readonly loading = this.feed.loading;
    readonly healthMessage = this.feed.healthMessage;

    readonly calls = computed(() => this.summary()?.calls ?? []);

    // True only once a payload has arrived AND the feed was readable, so an
    // empty table can be told apart from one that never loaded.
    readonly callsAvailable = computed(() => !this.loading() && (this.summary()?.calls_available ?? false));

    /** The backend's verdict on whether this feed's data can be believed.
     *  Defaults to trusting it, so a backend that predates the field leaves
     *  the board unchanged rather than blanking it. */
    readonly trusted = computed(() => this.summary()?.health?.trusted ?? true);

    /** Open or close the stream - see `liveTableFeed`. */
    setWanted(wanted: boolean): void {
        this.feed.setWanted(wanted);
    }

    /** One-shot fetch of both tables, for callers that do not want a live
     *  connection. */
    fetchOnce(): Observable<CallLogSummary> {
        return this.http.get<CallLogSummary>(`${API_BASE_URL}/call-log`);
    }

    ngOnDestroy(): void {
        this.feed.destroy();
    }
}

/** สายที่ไม่ได้รับ - the abandoned-call table. */
@Injectable()
export class MissedCallsDataService implements OnDestroy {
    private readonly feed = liveTableFeed<MissedCallsSummary>(`${API_BASE_URL}/call-log/missed/stream`, 'call-log-missed');

    readonly summary = this.feed.summary;
    readonly loading = this.feed.loading;
    readonly healthMessage = this.feed.healthMessage;

    readonly missed = computed(() => this.summary()?.missed ?? []);
    readonly missedAvailable = computed(() => !this.loading() && (this.summary()?.missed_available ?? false));

    /** Open or close the stream - see `liveTableFeed`. */
    setWanted(wanted: boolean): void {
        this.feed.setWanted(wanted);
    }

    ngOnDestroy(): void {
        this.feed.destroy();
    }
}
