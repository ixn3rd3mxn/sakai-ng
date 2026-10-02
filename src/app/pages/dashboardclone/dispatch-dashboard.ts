import { Component, computed, inject } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { SeverityStatisticsWidget } from './components/severity-statistics-widget';
import { IncidentTypeStatsWidget } from './components/incident-type-stats-widget';
import { RecentIncidentsWidget } from './components/recent-incidents-widget';
import { FrequentCbdCasesWidget } from './components/frequent-cbd-cases-widget';
import { DailyIncidentSummaryWidget } from './components/daily-incident-summary-widget';
import { DispatchActionDial } from './components/dispatch-action-dial';
import { SHIFT_CODE_TO_LABEL, TimePeriod } from './dispatch.types';
import { DispatchDataService } from './services/dispatch-data.service';
import { IncidentRangeTrend } from '../incident-history/components/incident-range-trend';
import { formatBuddhistDay } from './services/date-utils';

@Component({
    selector: 'app-dispatch-dashboard',
    imports: [IncidentTypeStatsWidget, RecentIncidentsWidget, FrequentCbdCasesWidget, DailyIncidentSummaryWidget, SeverityStatisticsWidget, IncidentRangeTrend, ScrollTopModule, ToastModule, DispatchActionDial],
    // One toast for the page: the action dial and the heading's refresh
    // button both report through it.
    providers: [DispatchDataService, MessageService],
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
                [failed]="dataService.failed()"
                [staleSince]="dataService.staleSince()"
                [shift]="selectedTimePeriod().name"
                [selectedDate]="dataService.selectedDate()"
                [historical]="!dataService.isCurrent()"
                [rangeLabel]="rangeLabel()"
                [compareLabel]="dataService.isRange() ? 'เทียบกับช่วงก่อน' : 'เทียบกับเมื่อวาน'"
                (resetToCurrent)="resetToCurrent()"
                class="contents"
            >
                <!-- Projected into the widget's two columns rather than placed
                     as grid items here, because the left column has to hold the
                     แจ้งเหตุ breakdown cards *above* these panels - and those
                     cards live in the widget, which owns their data. -->
                <div leftPanel>
                    <!-- Over several days "latest" means nothing; how the days
                         went takes its place - the summary page's own chart.
                         The two share one grid cell and บันทึกล่าสุด stays in it,
                         invisible, so the cell is always its height and the
                         chart stretches to fill it: swapping them never moves
                         the CBD card below, whatever state, width or scrollbar
                         the table is in. The chart's 0.25rem off is the card
                         margin both cards carry, already inside the cell. -->
                    <div class="recent-slot">
                        @if (dataService.isRange()) {
                            <app-incident-range-trend
                                [days]="dataService.range()?.per_day ?? []"
                                [continuous]="dataService.rangeSelection()?.kind === 'range'"
                                [loading]="dataService.loading()"
                                [failed]="dataService.failed()"
                                height="calc(100% - 0.25rem)"
                            />
                        }
                        <app-recent-incidents
                            [incidents]="summary()?.recent_incidents ?? []"
                            [loading]="dataService.loading()"
                            [failed]="dataService.failed()"
                            [class.slot-sizer]="dataService.isRange()"
                            [attr.aria-hidden]="dataService.isRange() || null"
                        />
                    </div>
                    <app-frequent-cbd-cases [items]="summary()?.frequent_cbd ?? []" [loading]="dataService.loading()" [failed]="dataService.failed()" />
                </div>
                <div rightPanel>
                    <app-severity-statistics [items]="summary()?.severity_stats ?? []" [loading]="dataService.loading()" [failed]="dataService.failed()" />
                    <app-daily-incident-summary
                        [summary]="summary()?.daily_summary ?? null"
                        [loading]="dataService.loading()"
                        [failed]="dataService.failed()"
                        [title]="dataService.isRange() ? 'ผลรวมทั้งหมดต่อช่วงที่เลือก' : 'ผลรวมทั้งหมดต่อวัน'"
                    />
                </div>
            </app-incident-type-stats>
        </div>
        <p-toast />
        <p-scrolltop />
        <app-dispatch-action-dial />
    `,
    styles: [`
        /* บันทึกล่าสุด and the range chart stacked in one cell - see the
           template. minmax(0, 1fr) so the table's 32rem min-width scrolls
           inside its card, as before, rather than widening the column. */
        .recent-slot {
            display: grid;
            grid-template-columns: minmax(0, 1fr);
        }

        .recent-slot > * {
            grid-area: 1 / 1;
        }

        /* Holds the cell at the table's height while the chart is shown.
           visibility, not display: it must still take up its space. */
        .slot-sizer {
            visibility: hidden;
        }

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
    private messageService = inject(MessageService);

    // The shift's board or the range's - the widgets read the same shapes.
    protected summary = this.dataService.board;

    // The heading's words for the days chosen, e.g. "01/09/2569 – 28/09/2569
    // (28 วัน)" or "วันที่ 8, 9/09/2569" - as on /report/summary.
    protected readonly rangeLabel = computed(() => {
        const selection = this.dataService.rangeSelection();
        if (!selection) return null;
        if (selection.kind === 'range') {
            const days = Math.round((selection.to.getTime() - selection.from.getTime()) / 86_400_000) + 1;
            return `${formatBuddhistDay(selection.from)} – ${formatBuddhistDay(selection.to)} (${days} วัน)`;
        }
        const dates = selection.dates;
        const first = dates[0];
        const sameMonth = dates.every((d) => d.getMonth() === first.getMonth() && d.getFullYear() === first.getFullYear());
        if (sameMonth && dates.length <= 5) return `วันที่ ${dates.map((d) => d.getDate()).join(', ')}/${formatBuddhistDay(first).slice(3)}`;
        return `${dates.length} วัน (${formatBuddhistDay(first)} – ${formatBuddhistDay(dates[dates.length - 1])})`;
    });

    protected selectedTimePeriod = computed<TimePeriod>(() => ({ name: SHIFT_CODE_TO_LABEL[this.dataService.selectedShift()] }));

    // Same toast as the dial's วันเวลาปัจจุบัน, which does the same thing.
    protected resetToCurrent(): void {
        this.dataService.selectCurrent();
        this.messageService.add({ severity: 'success', summary: 'รีเซ็ตเป็นปัจจุบัน', detail: 'กำลังดูข้อมูลปัจจุบัน' });
    }
}
