import { Component } from '@angular/core';
import { AgentStatusWidget } from './components/agent-status-widget';
import { CallStatsWidget } from './components/call-stats-widget';
import { AgentsDataService } from './services/agents-data.service';
import { CallStatsDataService } from './services/call-stats-data.service';

@Component({
    selector: 'app-automate-dashboard',
    standalone: true,
    imports: [CallStatsWidget, AgentStatusWidget],
    // Provided here rather than in root so both SSE connections are opened
    // when the page is entered and closed when it is left, instead of living
    // for the whole app session.
    providers: [CallStatsDataService, AgentsDataService],
    template: `
        <!-- Same shape as /report/dashboard: the stat rows span all twelve
             columns via the contents class, then the page splits in half at xl. The
             right half is intentionally empty for now - the next panel drops
             into a sibling col-span-12 xl:col-span-6. -->
        <div class="grid grid-cols-12 gap-1">
            <app-call-stats-widget class="contents" />
            <div class="col-span-12 xl:col-span-6">
                <app-agent-status-widget />
            </div>
        </div>
    `
})
export class AutomateDashboard {}
