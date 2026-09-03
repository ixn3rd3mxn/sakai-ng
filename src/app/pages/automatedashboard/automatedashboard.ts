import { Component, inject } from '@angular/core';
import { AgentStatusWidget } from './components/agent-status-widget';
import { CallLogWidget } from './components/call-log-widget';
import { CallStatsWidget } from './components/call-stats-widget';
import { HourlyChartWidget } from './components/hourly-chart-widget';
import { MissedCallsWidget } from './components/missed-calls-widget';
import { AgentsDataService } from './services/agents-data.service';
import { CallLogDataService } from './services/call-log-data.service';
import { CallStatsDataService } from './services/call-stats-data.service';

@Component({
    selector: 'app-automate-dashboard',
    standalone: true,
    imports: [CallStatsWidget, AgentStatusWidget, HourlyChartWidget, CallLogWidget, MissedCallsWidget],
    // Provided here rather than in root so both SSE connections are opened
    // when the page is entered and closed when it is left, instead of living
    // for the whole app session.
    providers: [CallStatsDataService, AgentsDataService, CallLogDataService],
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
                 people look up. mt-8 keeps the rhythm the roster set. -->
            <div class="col-span-12 mt-8">
                <app-hourly-chart />
            </div>
            <!-- mt-8 matches the margin agent-status-widget puts above its own
                 heading, keeping one rhythm down the page. Both carry it so the
                 pair stays level at xl and stays separated when they stack. -->
            <!-- Exceptions on the left, so the short actionable list is read
                 first. The two will not always be the same height - missed
                 calls is usually a handful of rows and the log fills up as the
                 day goes on - which is the cost of putting them side by side. -->
            <div class="col-span-12 xl:col-span-4 mt-8">
                <app-missed-calls
                    [calls]="callLogData.missed()"
                    [loading]="callLogData.loading()"
                    [available]="callLogData.missedAvailable()"
                    [health]="callLogData.healthMessage()"
                />
            </div>
            <div class="col-span-12 xl:col-span-8 mt-8">
                <app-call-log
                    [calls]="callLogData.calls()"
                    [loading]="callLogData.loading()"
                    [available]="callLogData.callsAvailable()"
                    [health]="callLogData.healthMessage()"
                />
            </div>
        </div>
    `
})
export class AutomateDashboard {
    // One service behind both tables: they come from two upstream feeds but
    // arrive in a single payload over one SSE connection, so the page holds
    // three streams rather than four.
    protected readonly callLogData = inject(CallLogDataService);
}
