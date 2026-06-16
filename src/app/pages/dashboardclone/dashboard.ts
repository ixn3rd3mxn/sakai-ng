import { Component, inject, OnInit } from '@angular/core';
import { ScrollTopModule } from 'primeng/scrolltop';
import { SpeedDialModule } from 'primeng/speeddial';
import { ToastModule } from 'primeng/toast';
import { MenuItem, MessageService } from 'primeng/api';
import { NotificationsWidget } from './components/notificationswidget';
import { StatsWidget } from './components/statswidget';
import { RecentSalesWidget } from './components/recentsaleswidget';
import { BestSellingWidget } from './components/bestsellingwidget';
import { RevenueStreamWidget } from './components/revenuestreamwidget';

@Component({
    selector: 'app-dashboardclone',
    imports: [StatsWidget, RecentSalesWidget, BestSellingWidget, RevenueStreamWidget, NotificationsWidget, ScrollTopModule, ToastModule, SpeedDialModule],
    template: `
        <p-toast />
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
        <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem' }" />
    `,
    styles: [`
        :host ::ng-deep .p-scrolltop {
            right: 4.2rem !important;
            bottom: 1rem !important;
        }
    `],
    providers: [MessageService]
})
export class DashboardCloneComponent implements OnInit {
    private messageService = inject(MessageService);
    items: MenuItem[] | null = null;

    ngOnInit() {
        this.items = [
            {
                icon: 'pi pi-pencil',
                command: () => {
                    this.messageService.add({ severity: 'info', summary: 'Add', detail: 'Data Added' });
                }
            },
            {
                icon: 'pi pi-refresh',
                command: () => {
                    this.messageService.add({ severity: 'success', summary: 'Update', detail: 'Data Updated' });
                }
            },
            {
                icon: 'pi pi-trash',
                command: () => {
                    this.messageService.add({ severity: 'error', summary: 'Delete', detail: 'Data Deleted' });
                }
            },
            {
                icon: 'pi pi-upload',
                routerLink: ['/fileupload']
            },
            {
                icon: 'pi pi-external-link',
                target: '_blank',
                url: 'https://angular.dev'
            }
        ];
    }
}
