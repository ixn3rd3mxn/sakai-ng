import { Component, computed, inject } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { SeverityStatisticsWidget } from './components/severity-statistics-widget';
import { IncidentTypeStatsWidget } from './components/incident-type-stats-widget';
import { RecentIncidentsWidget } from './components/recent-incidents-widget';
import { FrequentCbdCasesWidget } from './components/frequent-cbd-cases-widget';
import { DailyIncidentSummaryWidget } from './components/daily-incident-summary-widget';
import { DispatchActionDial } from './components/dispatch-action-dial';
import { SHIFT_CODE_TO_LABEL, TimePeriod } from './dispatch.types';
import { DispatchDataService } from './services/dispatch-data.service';

@Component({
    selector: 'app-dispatch-dashboard',
    imports: [IncidentTypeStatsWidget, RecentIncidentsWidget, FrequentCbdCasesWidget, DailyIncidentSummaryWidget, SeverityStatisticsWidget, ScrollTopModule, DispatchActionDial],
    providers: [DispatchDataService],
    template: `
        <div class="grid grid-cols-12 gap-1">
            <!-- The day and shift being shown - and, when it is a back-dated
                 one, the warning that says so - ride in this widget's heading.
                 They used to be a full-width banner above the grid; the line is
                 the same, it just sits next to the numbers it qualifies. -->
            <app-incident-type-stats
                [stats]="summary()?.incident_type_stats ?? null"
                [breakdowns]="summary()?.incident_breakdowns ?? null"
                [loading]="dataService.loading()"
                [shift]="selectedTimePeriod().name"
                [selectedDate]="dataService.selectedDate()"
                [historical]="!dataService.isCurrent()"
                (resetToCurrent)="dataService.selectCurrent()"
                class="contents"
            >
                <!-- Projected into the widget's two columns rather than placed
                     as grid items here, because the left column has to hold the
                     แจ้งเหตุ breakdown cards *above* these panels - and those
                     cards live in the widget, which owns their data. -->
                <div leftPanel>
                    <app-daily-incident-summary [summary]="summary()?.daily_summary ?? null" [loading]="dataService.loading()" />
                    <app-severity-statistics [items]="summary()?.severity_stats ?? []" [loading]="dataService.loading()" />
                </div>
                <div rightPanel>
                    <app-recent-incidents [incidents]="summary()?.recent_incidents ?? []" [loading]="dataService.loading()" />
                    <app-frequent-cbd-cases [items]="summary()?.frequent_cbd ?? []" [loading]="dataService.loading()" />
                </div>
            </app-incident-type-stats>
        </div>
        <p-scrolltop />
        <app-dispatch-action-dial />
    `,
    styles: [`
        /* Third of the three floating controls in this corner, sized and placed
           to match the save button and menu dial in DispatchActionDial: 50px,
           with a 20px icon. The right offset has to clear the save button that
           sits in the corner beside it, and pairs with the menu dial's bottom
           offset over there - keep the two in step.

           !important because PrimeNG sets the position inline on the element. */
        :host ::ng-deep .p-scrolltop {
            right: 5rem !important;
            bottom: 1rem !important;
            width: 50px !important;
            height: 50px !important;
        }

        /* The icon does not follow the button's size, so it needs saying too -
           the same 20px the save button and menu dial use. */
        :host ::ng-deep .p-scrolltop .p-scrolltop-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
            line-height: 20px;
        }
    `],
})
export class EmergencyDispatchDashboard {
    protected dataService = inject(DispatchDataService);

    protected summary = this.dataService.summary;

    protected selectedTimePeriod = computed<TimePeriod>(() => ({ name: SHIFT_CODE_TO_LABEL[this.dataService.selectedShift()] }));
}
