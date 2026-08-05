import { Component } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { SeverityStatisticsWidget } from './components/severity-statistics-widget';
import { IncidentTypeStatsWidget } from './components/incident-type-stats-widget';
import { RecentIncidentsWidget } from './components/recent-incidents-widget';
import { FrequentCbdCasesWidget } from './components/frequent-cbd-cases-widget';
import { DailyIncidentSummaryWidget } from './components/daily-incident-summary-widget';
import { DispatchActionDial } from './components/dispatch-action-dial';
import { DispatchDateTimeWarning } from './components/dispatch-datetime-warning';
import { DateTimeChangedEvent, TimePeriod } from './dispatch.types';

@Component({
    selector: 'app-dispatch-dashboard',
    imports: [IncidentTypeStatsWidget, RecentIncidentsWidget, FrequentCbdCasesWidget, DailyIncidentSummaryWidget, SeverityStatisticsWidget, ScrollTopModule, DispatchActionDial, DispatchDateTimeWarning],
    template: `
        <app-dispatch-datetime-warning [visible]="showDateTimeWarning" [selectedDate]="selectedDate" [selectedTime]="selectedTime" (visibleChange)="showDateTimeWarning = $event" />
        <div class="grid grid-cols-12 gap-1">
            <app-incident-type-stats class="contents" />
            <div class="col-span-12 xl:col-span-6">
                <app-daily-incident-summary />
                <app-severity-statistics />
            </div>
            <div class="col-span-12 xl:col-span-6">
                <app-recent-incidents />
                <app-frequent-cbd-cases />
            </div>
        </div>
        <p-scrolltop />
        <app-dispatch-action-dial (dateTimeChanged)="onDateTimeChanged($event)" />
    `,
    styles: [`
        :host ::ng-deep .p-scrolltop {
            right: 4.2rem !important;
            bottom: 1rem !important;
        }
    `],
})
export class EmergencyDispatchDashboard {
    showDateTimeWarning: boolean = false;
    selectedDate: Date | undefined;
    selectedTime: TimePeriod | null = null;

    onDateTimeChanged(event: DateTimeChangedEvent) {
        this.showDateTimeWarning = !event.isCurrent;
        this.selectedDate = event.date;
        this.selectedTime = event.time;
    }
}
