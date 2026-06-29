import { Component } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { NotificationsWidget } from './components/notificationswidget';
import { StatsWidget } from './components/statswidget';
import { RecentSalesWidget } from './components/recentsaleswidget';
import { BestSellingWidget } from './components/bestsellingwidget';
import { RevenueStreamWidget } from './components/revenuestreamwidget';
import { SpeedDial } from './components/speeddial';
import { DateTimeWarningBanner } from './components/datetime-warning-banner';

@Component({
    selector: 'app-dashboardclone',
    imports: [StatsWidget, RecentSalesWidget, BestSellingWidget, RevenueStreamWidget, NotificationsWidget, ScrollTopModule, SpeedDial, DateTimeWarningBanner],
    template: `
        <app-datetime-warning-banner [visible]="showDateTimeWarning" (visibleChange)="showDateTimeWarning = $event" />
        <div class="grid grid-cols-12 gap-1">
            <app-stats-widget class="contents" />
            <div class="col-span-12 xl:col-span-6">
                <app-revenue-stream-widget />
                <app-notifications-widget />
            </div>
            <div class="col-span-12 xl:col-span-6">
                <app-recent-sales-widget />
                <app-best-selling-widget />
            </div>
        </div>
        <p-scrolltop />
        <app-speed-dial (dateTimeChanged)="onDateTimeChanged($event)" />
    `,
    styles: [`
        :host ::ng-deep .p-scrolltop {
            right: 4.2rem !important;
            bottom: 1rem !important;
        }
    `],
})
export class DashboardCloneComponent {
    showDateTimeWarning: boolean = false;

    onDateTimeChanged(event: { isCurrent: boolean, date: Date | undefined, time: any }) {
        this.showDateTimeWarning = !event.isCurrent;
    }
}
