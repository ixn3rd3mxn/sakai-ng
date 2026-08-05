import { Component, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

interface RecentIncident {
    time: string;
    callType: string;
    cbd: string;
    severity: string;
}

@Component({
    standalone: true,
    selector: 'app-recent-incidents',
    imports: [TableModule, TagModule],
    template: `<div class="card" style="margin-bottom: 0.25rem">
        <div class="font-semibold text-xl mb-4">บันทึกล่าสุด</div>
        <p-table [value]="incidents()" [paginator]="true" [rows]="5" responsiveLayout="scroll">
            <ng-template #header>
                <tr>
                    <th>เวลา</th>
                    <th>ประเภท</th>
                    <th>CBD</th>
                    <th>ระดับ</th>
                </tr>
            </ng-template>
            <ng-template #body let-incident>
                <tr>
                    <td>{{ incident.time }}</td>
                    <td style="min-width: 7.76rem;">{{ incident.callType }}</td>
                    <td>{{ incident.cbd }}</td>
                    <td><p-tag [severity]="getSeverity(incident.severity)" [value]="incident.severity" /></td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class RecentIncidentsWidget {
    incidents = signal<RecentIncident[]>([
        { time: '23:59:59', callType: 'แจ้งซ้ำเหตุเดิม', cbd: 'CBD23', severity: 'เหลือง' },
        { time: '23:41:12', callType: 'แจ้งเหตุ', cbd: 'CBD6', severity: 'แดง' },
        { time: '23:18:47', callType: 'ปรึกษา', cbd: 'CBD9', severity: 'เขียว' },
        { time: '22:55:03', callType: 'แจ้งเหตุ', cbd: 'CBD25', severity: 'ดำ' },
        { time: '22:30:29', callType: 'สายหลุด', cbd: 'CBD11', severity: 'ขาว' }
    ]);

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
