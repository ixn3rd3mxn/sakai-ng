import { Component, computed, effect, input, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { Table, TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { MissedCallEntry } from '../call-log.types';
import { PageFillerRow, isPageFiller, padToPage } from '../../dashboardclone/services/page-filler';

const PAGE_SIZE = 8;

// Placeholder rows so the table lays out at its normal height while loading;
// the loading branch renders skeleton cells and reads none of these fields.
const SKELETON_ROWS = Array.from({ length: PAGE_SIZE }, () => ({}) as MissedCallEntry);

@Component({
    standalone: true,
    selector: 'app-missed-calls',
    imports: [TableModule, SkeletonModule, ButtonModule],
    template: `<div class="card" style="margin-bottom: 0">
        <div class="flex items-center justify-between gap-2 mb-4">
            <!-- Title and feed warning share the left side, so the message sits
                 where this page already puts one - beside the heading, not
                 floating between the heading and the link. -->
            <div class="flex items-baseline gap-2 min-w-0">
                <div class="font-semibold text-xl">สายที่ไม่ได้รับ</div>
                @if (health()) {
                    <span class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ health() }}</span>
                }
            </div>
            <!-- Opens the official NIEMS page in a new tab. An anchor rather
                     than a button because pButton is an attribute directive, so
                     this is a real link: middle-click works, and the board
                     itself is never navigated away from. -->
                <!-- <a
                    pButton
                    href="https://rnis-qm.niems.go.th/contact-history"
                    target="_blank"
                    rel="noopener noreferrer"
                    label="ดูรายละเอียด"
                    icon="pi pi-external-link"
                    iconPos="right"
                    severity="secondary"
                    size="small"
                    [text]="true"
                    class="shrink-0"
                ></a> -->
        </div>
        <p-table [value]="tableRows()" [paginator]="true" [rows]="PAGE_SIZE" stripedRows [scrollable]="true" [rowHover]="true" responsiveLayout="scroll">
            <ng-template #header>
                <!-- The same 8rem floor the call log uses on every column, so
                     the two tables share one unit across the row. -->
                <tr>
                    <th style="min-width: 8rem;">เบอร์โทรศัพท์</th>
                    <!-- Right-aligned: a column of clock readings is scanned
                         down its digits, and ragged right breaks that. -->
                    <th class="text-right" style="min-width: 8rem;">เวลาที่โทรเข้า</th>
                </tr>
            </ng-template>
            <ng-template #body let-call>
                @if (loading()) {
                    <tr>
                        <td><p-skeleton /></td>
                        <td><span class="tag-box"><p-skeleton width="5rem" /></span></td>
                    </tr>
                } @else if (isPageFiller(call)) {
                    <!-- Pads a short page to PAGE_SIZE rows so the paginator
                         does not move; see page-filler.ts. -->
                    <tr>
                        <td>-</td>
                        <td class="text-right">-<span class="tag-box"></span></td>
                    </tr>
                } @else {
                    <tr>
                        <!-- A withheld number is a fact about the call, so it
                             is stated rather than left blank - an empty cell
                             reads as a rendering fault. -->
                        @if (call.phone) {
                            <td class="tabular-nums whitespace-nowrap">{{ call.phone }}</td>
                        } @else {
                            <td class="whitespace-nowrap text-surface-500 dark:text-surface-400">ไม่แสดงเบอร์</td>
                        }
                        <!-- The empty tag-box is a spacer: this table has no
                             badges, so its rows would be a text line tall while
                             the call log beside it is a tag tall, and the two
                             would not line up row for row. A zero-width box with
                             a tag's height (.tag-box, _utils.scss) in every row's
                             last cell - here, in the filler and around the
                             skeleton - makes the rows the same height. -->
                        <td class="tabular-nums whitespace-nowrap text-right">{{ call.at }}<span class="tag-box"></span></td>
                    </tr>
                }
            </ng-template>
            <!-- Only ever the failure case: a day with nothing recorded is a
                 page of fillers, not an empty table. -->
            <ng-template #emptymessage>
                <tr>
                    <td colspan="2">ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้</td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class MissedCallsWidget {
    calls = input<MissedCallEntry[]>([]);

    // While loading the table is fed placeholder rows instead of the data,
    // because a page of `-` fillers reads as "nothing recorded" - a statement
    // of fact that is not yet known to be true.
    loading = input<boolean>(false);

    /** False when the feed could not be read. Kept separate from `loading` so
     *  an unreachable source never renders as "no missed calls" - the good
     *  outcome and a total failure must not look the same. */
    available = input<boolean>(true);

    /** The backend's short line about the upstream feed, or `''` when it is
     *  healthy. Passed in rather than injected so these two tables stay
     *  presentational, like `available` above. */
    health = input<string>('');

    protected readonly PAGE_SIZE = PAGE_SIZE;
    protected readonly isPageFiller = isPageFiller;

    // Padded to whole pages so a short page does not move the paginator (see
    // page-filler.ts). Left empty when the feed is down so the table says so
    // instead of showing a page of dashes that reads as "no missed calls".
    protected readonly tableRows = computed<(MissedCallEntry | PageFillerRow)[]>(() => {
        if (this.loading()) return SKELETON_ROWS;
        return this.available() ? padToPage(this.calls(), PAGE_SIZE) : [];
    });

    private readonly table = viewChild.required(Table);

    constructor() {
        // Back to page 1 when the page being viewed no longer exists. There is
        // no day picker here, but the list empties at midnight (and when the
        // feed drops), and the table keeps its page across value changes - a
        // user on page 5 would be left looking at an empty page 5. Its
        // paginator only steps back one page per change, so it cannot be
        // relied on to get there. A tick that only adds rows leaves the page
        // alone.
        effect(() => {
            const table = this.table();
            if ((table.first ?? 0) >= this.tableRows().length) table.first = 0;
        });
    }
}
