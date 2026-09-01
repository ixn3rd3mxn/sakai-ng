import { Component, computed, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { MissedCallEntry } from '../call-log.types';

// Placeholder rows so the table lays out at its normal height while loading;
// the loading branch renders skeleton cells and reads none of these fields.
const SKELETON_ROWS = Array.from({ length: 8 }, () => ({}) as MissedCallEntry);

@Component({
    standalone: true,
    selector: 'app-missed-calls',
    imports: [TableModule, SkeletonModule, ButtonModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="flex items-center justify-between gap-2 mb-4">
            <div class="font-semibold text-xl">สายที่ไม่ได้รับ</div>
            <!-- Opens the official NIEMS page in a new tab. An anchor rather
                     than a button because pButton is an attribute directive, so
                     this is a real link: middle-click works, and the board
                     itself is never navigated away from. -->
                <a
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
                ></a>
        </div>
        <p-table [value]="tableRows()" [paginator]="!loading()" [rows]="8" stripedRows [scrollable]="true" [rowHover]="true" responsiveLayout="scroll">
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
                        <td><p-skeleton width="5rem" /></td>
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
                        <td class="tabular-nums whitespace-nowrap text-right">{{ call.at }}</td>
                    </tr>
                }
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="2">{{ emptyMessage() }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class MissedCallsWidget {
    calls = input<MissedCallEntry[]>([]);

    // While loading the table is fed placeholder rows instead of `[]`, because
    // an empty value renders the empty message, and "there is nothing recorded
    // yet" must not be claimed before the data has arrived.
    loading = input<boolean>(false);

    /** False when the feed could not be read. Kept separate from `loading` so
     *  an unreachable source never renders as "no missed calls" - the good
     *  outcome and a total failure must not look the same. */
    available = input<boolean>(true);

    protected readonly tableRows = computed<MissedCallEntry[]>(() => (this.loading() ? SKELETON_ROWS : this.calls()));

    protected readonly emptyMessage = computed(() => (this.available() ? 'ยังไม่มีการบันทึกข้อมูล' : 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้'));
}
