import { Component, computed, effect, input, viewChild } from '@angular/core';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { RecentIncidentItem } from '../dispatch.types';
import { PageFillerRow, emptyStateAnchor, isPageFiller, padToPage } from '../services/page-filler';
import { TruncateTooltipDirective } from '../../../shared/truncate-tooltip.directive';
import { TableEmptyState } from '../../../shared/table-empty-state';

const PAGE_SIZE = 5;

// Placeholder rows so the table lays out at its normal height while
// loading; the loading branch renders skeleton cells and reads none
// of these fields.
const SKELETON_ROWS = Array.from({ length: PAGE_SIZE }, () => ({}) as RecentIncidentItem);

@Component({
    standalone: true,
    selector: 'app-recent-incidents',
    imports: [TableModule, TagModule, SkeletonModule, TruncateTooltipDirective, TableEmptyState],
    template: `<div class="card table-card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">บันทึกล่าสุด</div>
        <!-- Fixed table layout: column widths come from the header cells
             alone, so they no longer follow the longest value on whichever
             page is showing and the columns stay put across pages. The
             min-width is the sum of the columns; below it the table scrolls
             sideways (responsiveLayout) rather than squeezing them. -->
        <p-table [value]="tableRows()" [class.table-loading]="showSkeleton()" [paginator]="true" [rows]="PAGE_SIZE" responsiveLayout="scroll" [tableStyle]="{ 'table-layout': 'fixed', 'min-width': '32rem' }">
            <ng-template #header>
                <tr>
                    <th style="width: 6rem;">เวลา</th>
                    <th style="width: 8rem;">ประเภท</th>
                    <th style="width: 11rem;">CBD</th>
                    <th style="width: 7rem;">ระดับ</th>
                </tr>
            </ng-template>
            <ng-template #body let-incident let-rowIndex="rowIndex">
                @if (showSkeleton()) {
                    <tr>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <!-- In a tag-sized box (.tag-box, _utils.scss) so a loading
                             row is as tall as a loaded one; a bare skeleton is 1rem,
                             shorter than a badge. -->
                        <td><span class="tag-box"><p-skeleton width="4rem" /></span></td>
                    </tr>
                } @else if (isPageFiller(incident) && (failed() || incidents().length === 0)) {
                    <!-- Nothing recorded yet, or the source cannot be reached:
                         the page of fillers drawn blank, with the empty state
                         over the middle of it, so the table stays the size it
                         was while loading - see .table-empty-row in
                         _utils.scss. -->
                    <tr class="table-empty-row">
                        <td colspan="4" [class.table-empty-anchor]="rowIndex === emptyAnchor.row">
                            <span class="tag-box"></span>
                            @if (rowIndex === emptyAnchor.row) {
                                <div class="table-empty-overlay" [style.top]="emptyAnchor.top">
                                    @if (failed()) {
                                        <app-table-empty-state icon="pi-exclamation-circle" title="ไม่สามารถเชื่อมต่อแหล่งข้อมูลได้" subtitle="ระบบจะเชื่อมต่อใหม่อัตโนมัติ" />
                                    } @else {
                                        <app-table-empty-state icon="pi-inbox" title="ยังไม่มีการบันทึกข้อมูล" subtitle="เหตุการณ์ที่บันทึกจะแสดงที่นี่" />
                                    }
                                </div>
                            }
                        </td>
                    </tr>
                } @else if (isPageFiller(incident)) {
                    <!-- Pads a short page to PAGE_SIZE rows so the paginator
                         does not move; see page-filler.ts. Same tag-sized box
                         in the last cell as a real row without a badge. -->
                    <tr>
                        <td>-</td>
                        <td>-</td>
                        <td>-</td>
                        <td><span class="tag-box">-</span></td>
                    </tr>
                } @else {
                <tr>
                    <td>{{ incident.time }}</td>
                    <td>{{ incident.call_type }}</td>
                    <td style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" [appTruncateTooltip]="incident.cbd">{{ incident.cbd }}</td>
                    <td>
                        @if (incident.severity === '-') {
                            <!-- The dash sits in a tag-sized box (.tag-box,
                                 _utils.scss) so a row without a badge is exactly
                                 as tall as one with - otherwise the table jumps
                                 by a few px as rows page in and out. -->
                            <span class="tag-box">-</span>
                        } @else {
                            <p-tag [severity]="getSeverity(incident.severity)" [value]="incident.severity" />
                        }
                    </td>
                </tr>
                }
            </ng-template>
        </p-table>
    </div>`
})
export class RecentIncidentsWidget {
    incidents = input<RecentIncidentItem[]>([]);

    // While loading the table is fed placeholder rows instead of the data,
    // because a page of `-` fillers reads as "nothing recorded" - a statement
    // of fact that is not yet known to be true.
    loading = input<boolean>(false);

    /** The source could not be reached for the selection on screen. Wins
     *  over `loading`: the table says so instead of a skeleton that would
     *  never end, or "nothing recorded", which would be false. */
    failed = input<boolean>(false);

    protected readonly showSkeleton = computed(() => this.loading() && !this.failed());

    protected readonly PAGE_SIZE = PAGE_SIZE;
    protected readonly isPageFiller = isPageFiller;
    protected readonly emptyAnchor = emptyStateAnchor(PAGE_SIZE);

    protected readonly tableRows = computed<(RecentIncidentItem | PageFillerRow)[]>(() => (this.showSkeleton() ? SKELETON_ROWS : padToPage(this.failed() ? [] : this.incidents(), PAGE_SIZE)));

    private readonly table = viewChild.required(Table);

    constructor() {
        // Back to page 1 whenever a new day/shift is requested. The table keeps
        // its page across value changes, so a user on page 9 who switches to a
        // shift with 8 pages would otherwise land on an empty page 9. Keyed on
        // loading rather than on the incidents themselves because the summary
        // is a live stream - a tick must not throw the user back to page 1.
        effect(() => {
            if (this.loading()) this.table().first = 0;
        });
    }

    getSeverity(severity: string) {
        switch (severity) {
            case 'แดง': return 'danger';
            case 'เหลือง': return 'warn';
            case 'เขียว': return 'success';
            case 'ขาว': return 'secondary';
            case 'ดำ': return 'contrast';
            default: return 'info';
        }
    }
}
