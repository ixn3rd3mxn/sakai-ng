import { Component, computed, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { CallLogEntry, CallStatus } from '../call-log.types';
import { formatDuration } from '../format-utils';

// Wording matches the stat cards above the table on purpose - "รับสาย" and
// "ไม่ได้รับสาย" mean the same thing in both places, so a reader can tie a row
// to the counter it contributed to without translating.
//
// Severity carries the same meaning as the card colours: green for a call that
// was handled, red for one that was not, amber for the case that is neither -
// the call reached a desk and nobody picked up, which is a staffing signal
// rather than a caller giving up.
const STATUS_TAG: Record<CallStatus, { label: string; severity: 'success' | 'danger' | 'warn' | 'secondary' }> = {
    answered: { label: 'รับสาย', severity: 'success' },
    abandoned: { label: 'ไม่ได้รับสาย', severity: 'danger' },
    queue_full: { label: 'ไม่ได้รับสาย คิวเต็ม', severity: 'danger' },
    no_answer: { label: 'เจ้าหน้าที่ปฏิเสธสาย', severity: 'warn' },
    unknown: { label: 'ไม่ทราบสถานะ', severity: 'secondary' }
};

const SKELETON_ROWS = Array.from({ length: 8 }, () => ({}) as CallLogEntry);

@Component({
    standalone: true,
    selector: 'app-call-log',
    imports: [TableModule, SkeletonModule, ButtonModule, TagModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="flex items-center justify-between gap-2 mb-4">
            <div class="font-semibold text-xl">ประวัติการรับสาย</div>
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
        <!-- responsiveLayout="scroll" is the deliberate failure mode, not
             boilerplate: it keeps every row on one line, where wrapping would
             double the row height and ruin the scan down the columns. At the
             current 8/12 split there is room to spare, but a narrower column
             would otherwise start folding the time range. -->
        <p-table [value]="tableRows()" [paginator]="!loading()" [rows]="8" stripedRows [scrollable]="true" [rowHover]="true" responsiveLayout="scroll">
            <ng-template #header>
                <!-- One 8rem floor for every column, here and in the missed-calls
                     table, so the two read as one grid rather than two tables that
                     happen to sit side by side. Four of them keeps the total
                     minimum at the 32rem this column was sized around.

                     A floor, not a width: ช่วงเวลาการโทร holds nineteen nowrap
                     characters and settles wider than 8rem on its own. Evening up
                     the floors is what stops the other three collapsing to their
                     text and leaving it looking oversized next to them. -->
                <tr>
                    <th style="min-width: 7rem;">เจ้าหน้าที่</th>
                    <th style="min-width: 8rem;">เบอร์โทรศัพท์</th>
                    <!-- "การโทร", not "สนทนา". The upstream gives call_begin_at
                         with no companion answer timestamp, and its call log
                         does not reconcile with /v2/stats/summary/times, so
                         whether this range starts at answer or at delivery to
                         the desk could not be established. The heading claims
                         only what is certain. -->
                    <th style="min-width: 8rem;">ช่วงเวลาการโทร</th>
                    <th class="text-right" style="min-width: 6rem;">รวมเวลา</th>
                    <!-- 10rem because "ไม่ได้รับสาย คิวเต็ม" is the widest tag and
                         a wrapped tag reads as two tags. -->
                    <th style="min-width: 10rem;">สถานะ</th>
                </tr>
            </ng-template>
            <ng-template #body let-call>
                @if (loading()) {
                    <tr>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <td><p-skeleton width="4rem" /></td>
                        <td><p-skeleton width="6rem" /></td>
                    </tr>
                } @else {
                    <tr>
                        <!-- Extension in place of a missing name, same rule as
                             the agent board: a handled call must never show a
                             blank operator just because a reference row is
                             absent. title carries the full string, since a long
                             Thai name is the first thing this column truncates. -->
                        <!-- A dash when the call never reached a desk: a
                             queue-full row carries the queue in destination,
                             and printing it would invent an agent who handled
                             a call nobody took. Otherwise the extension stands
                             in for a missing name, as on the agent board. -->
                        @if (call.reached_agent) {
                            <td class="truncate" [title]="call.agent ?? call.extension">{{ call.agent ?? call.extension }}</td>
                        } @else {
                            <td class="text-surface-400 dark:text-surface-500">—</td>
                        }
                        <td class="tabular-nums whitespace-nowrap">{{ call.phone }}</td>
                        <td class="tabular-nums whitespace-nowrap">{{ call.answered_at }} - {{ call.hung_up_at }}</td>
                        <td class="tabular-nums whitespace-nowrap text-right">{{ duration(call) }}</td>
                        <td>
                            <p-tag [value]="tag(call).label" [severity]="tag(call).severity" />
                            @if (call.action) {
                                <span class="text-xs opacity-70 ml-1">({{ call.action }})</span>
                            }
                        </td>
                    </tr>
                }
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="5">{{ emptyMessage() }}</td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class CallLogWidget {
    calls = input<CallLogEntry[]>([]);
    loading = input<boolean>(false);

    /** False when the feed could not be read - see MissedCallsWidget. */
    available = input<boolean>(true);

    protected readonly tableRows = computed<CallLogEntry[]>(() => (this.loading() ? SKELETON_ROWS : this.calls()));

    protected readonly emptyMessage = computed(() => (this.available() ? 'ยังไม่มีการบันทึกข้อมูล' : 'ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้'));

    // Same HH:MM:SS the four duration cards use, so a row here can be read
    // against the averages above without converting units in your head.
    duration(call: CallLogEntry): string {
        return formatDuration(call.duration);
    }

    protected tag(call: CallLogEntry) {
        return STATUS_TAG[call.status] ?? STATUS_TAG.unknown;
    }
}
