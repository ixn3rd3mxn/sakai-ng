import { Component } from '@angular/core';
import { CallStatsWidget } from './components/call-stats-widget';
import { CallStatsDataService } from './services/call-stats-data.service';

@Component({
    selector: 'app-automate-dashboard',
    standalone: true,
    imports: [CallStatsWidget],
    // Provided here rather than in root so the SSE connection is opened when
    // the page is entered and closed when it is left, instead of living for
    // the whole app session.
    providers: [CallStatsDataService],
    template: `
        <div class="grid grid-cols-12 gap-1">
            <app-call-stats-widget class="contents" />
        </div>
    `
})
export class AutomateDashboard {}
