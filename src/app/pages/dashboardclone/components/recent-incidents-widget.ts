import { Component, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { RecentIncidentItem } from '../dispatch.types';

@Component({
    standalone: true,
    selector: 'app-recent-incidents',
    imports: [TableModule, TagModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">บันทึกล่าสุด</div>
        <p-table [value]="incidents()" [paginator]="true" [rows]="5" responsiveLayout="scroll">
            <ng-template #header>
                <tr>
                    <th style="min-width: 7rem;">เวลา</th>
                    <th style="min-width: 7rem;">ประเภท</th>
                    <th style="min-width: 7rem;">CBD</th>
                    <th style="min-width: 7rem;">ระดับ</th>
                </tr>
            </ng-template>
            <ng-template #body let-incident>
                <tr>
                    <td>{{ incident.time }}</td>
                    <td>{{ incident.call_type }}</td>
                    <td>{{ abbreviateCbd(incident.cbd) }}</td>
                    <td><p-tag [severity]="getSeverity(incident.severity)" [value]="incident.severity" /></td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class RecentIncidentsWidget {
    incidents = input<RecentIncidentItem[]>([]);

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
