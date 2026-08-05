import { Component, signal } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

interface RecentIncident {
    time: string;
    type: string;
    cbd: string;
    severityLabel: string;
    severityTag: 'danger' | 'warn' | 'success' | 'secondary' | 'contrast';
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
                    <td style="min-width: 7.76rem;">{{ incident.type }}</td>
                    <td>{{ incident.cbd }}</td>
                    <td><p-tag [severity]="incident.severityTag" [value]="incident.severityLabel" /></td>
                </tr>
            </ng-template>
        </p-table>
    </div>`
})
export class RecentIncidentsWidget {
    incidents = signal<RecentIncident[]>([
        { time: '23:59:59', type: 'แจ้งซ้ำเหตุเดิม', cbd: 'CBD23 ตกน้ำ / จมน้ำ', severityLabel: 'เหลือง', severityTag: 'warn' },
        { time: '23:41:12', type: 'แจ้งเหตุ', cbd: 'CBD6 หัวใจหยุดเต้น', severityLabel: 'แดง', severityTag: 'danger' },
        { time: '23:18:47', type: 'ปรึกษา', cbd: 'CBD9 เบาหวาน', severityLabel: 'เขียว', severityTag: 'success' },
        { time: '22:55:03', type: 'แจ้งเหตุ', cbd: 'CBD25 อุบัติเหตุจราจร', severityLabel: 'แดง', severityTag: 'danger' },
        { time: '22:30:29', type: 'สายหลุด', cbd: 'CBD11 ไม่มีข้อมูล', severityLabel: 'ขาว', severityTag: 'secondary' }
    ]);
}
