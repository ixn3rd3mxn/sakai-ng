import { Component, computed, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { RecentIncidentItem } from '../dispatch.types';

// Placeholder rows so the table lays out at its normal height while
// loading; the loading branch renders skeleton cells and reads none
// of these fields.
const SKELETON_ROWS = Array.from({ length: 5 }, () => ({}) as RecentIncidentItem);

@Component({
    standalone: true,
    selector: 'app-recent-incidents',
    imports: [TableModule, TagModule, SkeletonModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">บันทึกล่าสุด</div>
        <p-table [value]="tableRows()" [paginator]="!loading()" [rows]="5" responsiveLayout="scroll">
            <ng-template #header>
                <tr>
                    <th style="min-width: 7rem;">เวลา</th>
                    <th style="min-width: 7rem;">ประเภท</th>
                    <th style="min-width: 7rem;">CBD</th>
                    <th style="min-width: 7rem;">ระดับ</th>
                </tr>
            </ng-template>
            <ng-template #body let-incident>
                @if (loading()) {
                    <tr>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <td><p-skeleton /></td>
                        <td><p-skeleton width="4rem" /></td>
                    </tr>
                } @else {
                <tr>
                    <td>{{ incident.time }}</td>
                    <td>{{ incident.call_type }}</td>
                    <td>{{ abbreviateCbd(incident.cbd) }}</td>
                    <td>
                        @if (incident.severity === '-') {
                            -
                        } @else {
                            <p-tag [severity]="getSeverity(incident.severity)" [value]="incident.severity" />
                        }
                    </td>
                </tr>
                }
            </ng-template>
            <ng-template #emptymessage>
                <tr>
                    <td colspan="4">ยังไม่มีการบันทึกข้อมูล</td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class RecentIncidentsWidget {
    incidents = input<RecentIncidentItem[]>([]);

    // While loading the table is fed placeholder rows instead of `[]`,
    // because an empty value renders the "ยังไม่มีการบันทึกข้อมูล" message -
    // a statement of fact that is not yet known to be true.
    loading = input<boolean>(false);

    protected readonly tableRows = computed<RecentIncidentItem[]>(() => (this.loading() ? SKELETON_ROWS : this.incidents()));

    abbreviateCbd(cbd: string) {
        return cbd?.split(' ')[0] ?? cbd;
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
