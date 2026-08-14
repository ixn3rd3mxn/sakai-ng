import { Component, computed, inject } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { SeverityStatisticsWidget } from './components/severity-statistics-widget';
import { IncidentTypeStatsWidget } from './components/incident-type-stats-widget';
import { RecentIncidentsWidget } from './components/recent-incidents-widget';
import { FrequentCbdCasesWidget } from './components/frequent-cbd-cases-widget';
import { DailyIncidentSummaryWidget } from './components/daily-incident-summary-widget';
import { DispatchActionDial } from './components/dispatch-action-dial';
import { DispatchDateTimeWarning } from './components/dispatch-datetime-warning';
import { SHIFT_CODE_TO_LABEL, TimePeriod } from './dispatch.types';
import { DispatchDataService } from './services/dispatch-data.service';

@Component({
    selector: 'app-dispatch-dashboard',
    imports: [IncidentTypeStatsWidget, RecentIncidentsWidget, FrequentCbdCasesWidget, DailyIncidentSummaryWidget, SeverityStatisticsWidget, ScrollTopModule, DispatchActionDial, DispatchDateTimeWarning],
    providers: [DispatchDataService],
    template: `
        <app-dispatch-datetime-warning [historical]="!dataService.isCurrent()" [selectedDate]="dataService.selectedDate()" [selectedTime]="selectedTimePeriod()" />
        <div class="grid grid-cols-12 gap-1">
            <app-incident-type-stats [stats]="summary()?.incident_type_stats ?? null" class="contents" />
            <div class="col-span-12 xl:col-span-6">
                <app-daily-incident-summary [summary]="summary()?.daily_summary ?? null" />
                <app-severity-statistics [items]="summary()?.severity_stats ?? []" />
            </div>
            <div class="col-span-12 xl:col-span-6">
                <app-recent-incidents [incidents]="summary()?.recent_incidents ?? []" />
                <app-frequent-cbd-cases [items]="summary()?.frequent_cbd ?? []" />
            </div>
        </div>
        <p-scrolltop />
        <app-dispatch-action-dial />
    `,
    styles: [`
        :host ::ng-deep .p-scrolltop {
            right: 4.2rem !important;
            bottom: 1rem !important;
        }
    `],
})
export class EmergencyDispatchDashboard {
    protected dataService = inject(DispatchDataService);

    protected summary = this.dataService.summary;

    protected selectedTimePeriod = computed<TimePeriod>(() => ({ name: SHIFT_CODE_TO_LABEL[this.dataService.selectedShift()] }));
}
