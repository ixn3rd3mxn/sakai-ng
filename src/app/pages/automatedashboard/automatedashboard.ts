import { Component, effect, inject } from '@angular/core';
import { AgentStatusWidget } from './components/agent-status-widget';
import { CallLogWidget } from './components/call-log-widget';
import { CallStatsWidget } from './components/call-stats-widget';
import { HourlyChartWidget } from './components/hourly-chart-widget';
import { MissedCallsWidget } from './components/missed-calls-widget';
import { AgentsDataService } from './services/agents-data.service';
import { CallLogDataService, MissedCallsDataService } from './services/call-log-data.service';
import { CardVisibilityService } from './services/card-visibility.service';
import { CallStatsDataService } from './services/call-stats-data.service';
import { HourlyDataService } from './services/hourly-data.service';

@Component({
    selector: 'app-automate-dashboard',
    standalone: true,
    imports: [CallStatsWidget, AgentStatusWidget, HourlyChartWidget, CallLogWidget, MissedCallsWidget],
    // Provided here rather than in root so the SSE connections are opened
    // when the page is entered and closed when it is left, instead of living
    // for the whole app session.
    providers: [CallStatsDataService, HourlyDataService, AgentsDataService, CallLogDataService, MissedCallsDataService],
    template: `
        <!-- Stat rows span all twelve columns via the contents class, then the
             roster gets a full-width band and the two logs split the row below
             it.

             Not the /report/dashboard two-column shape, and deliberately so.
             That shape balances only when both columns are of similar height,
             which needs a roster of roughly 18+. A normal shift here is 4-6, so
             the agent cards filled about 310px against 970px of tables beside
             them - two thirds of that column was dead space. Banding the roster
             across the top and splitting the logs below drops the page from
             ~970px to ~710px.

             The logs split 4/8, not evenly: they need very different widths.
             Missed calls has two columns and needs ~256px; the log has four,
             one of which is a 19-character time range, and needs ~512px. An
             even split gave the log 493px - under its minimum, so it scrolled -
             while the two-column table sat in 493px of mostly whitespace. At
             4/8 (~327px and ~658px at 150% zoom) both are comfortable. -->
        <div class="grid grid-cols-12 gap-1">
            <app-call-stats-widget class="contents" />
            <div class="col-span-12">
                <app-agent-status-widget />
            </div>
            <!-- Full width, and below the roster rather than beside the cards
                 it elaborates: 24 stacked columns want the whole page, and
                 putting it higher would push the live agent board under a
                 22rem canvas on a screen where "who is free now" is the thing
                 people look up. mt-4 on top of the grid gap: the same 1rem
                 break the roster heading gets above it, so the chart reads as
                 a new section rather than another row of the roster. The two
                 tables below carry no margin - they continue the chart. -->
            <div class="col-span-12 mt-4">
                <app-hourly-chart [enabled]="hourlyOn()" (enabledChange)="cards.setEnabled('hourly', $event)" />
            </div>
            <!-- Exceptions on the left, so the short actionable list is read
                 first. The two will not always be the same height - missed
                 calls is usually a handful of rows and the log fills up as the
                 day goes on - which is the cost of putting them side by side. -->
            <div class="col-span-12 xl:col-span-4">
                <app-missed-calls
                    [calls]="missedData.missed()"
                    [loading]="missedData.loading()"
                    [available]="missedData.missedAvailable()"
                    [health]="missedData.healthMessage()"
                    [enabled]="missedOn()"
                    (enabledChange)="cards.setEnabled('missed', $event)"
                />
            </div>
            <div class="col-span-12 xl:col-span-8">
                <app-call-log
                    [calls]="callLogData.calls()"
                    [loading]="callLogData.loading()"
                    [available]="callLogData.callsAvailable()"
                    [health]="callLogData.healthMessage()"
                    [enabled]="callLogOn()"
                    (enabledChange)="cards.setEnabled('call-log', $event)"
                />
            </div>
        </div>
    `
})
export class AutomateDashboard {
    // One service - and one stream - per optional card. The two tables used
    // to share a payload over one connection and the chart rode on the
    // counters'; all three are split so each card's switch closes its own
    // stream and stops its own upstream polling (see the services).
    protected readonly callLogData = inject(CallLogDataService);
    protected readonly missedData = inject(MissedCallsDataService);
    protected readonly hourlyData = inject(HourlyDataService);

    protected readonly cards = inject(CardVisibilityService);
    protected readonly hourlyOn = this.cards.enabled('hourly');
    protected readonly missedOn = this.cards.enabled('missed');
    protected readonly callLogOn = this.cards.enabled('call-log');

    constructor() {
        // Each optional card's stream is open exactly while the card is on.
        // On the wall display, where none of the three is ever scrolled to,
        // these are the connections the switches exist to close - see
        // CardVisibilityService.
        effect(() => this.hourlyData.setWanted(this.hourlyOn()));
        effect(() => this.missedData.setWanted(this.missedOn()));
        effect(() => this.callLogData.setWanted(this.callLogOn()));
    }
}
