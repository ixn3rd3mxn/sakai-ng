import { Component, inject, OnInit } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
    standalone: true,
    selector: 'app-speed-dial',
    imports: [ToastModule, SpeedDialModule],
    template: `<p-toast />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem' }" [tooltipOptions]="{ tooltipPosition: 'left' }" />`,
    providers: [MessageService]
})
export class SpeedDial implements OnInit {
    private messageService = inject(MessageService);
    items: MenuItem[] | null = null;

    ngOnInit() {
        this.items = [
            {
                label: 'บันทึกข้อมูล',
                icon: 'pi pi-pencil',
                command: () => {
                    this.messageService.add({ severity: 'info', summary: 'Add', detail: 'Data Added' });
                }
            },
            {
                label: 'สลับวันเวลา',
                icon: 'pi pi-calendar-clock',
                command: () => {
                    this.messageService.add({ severity: 'error', summary: 'Delete', detail: 'Data Deleted' });
                }
            },
            {
                label: 'วันเวลาปัจจุบัน',
                icon: 'pi pi-refresh',
                command: () => {
                    this.messageService.add({ severity: 'success', summary: 'Update', detail: 'Data Updated' });
                }
            },
            {
                label: 'Upload',
                icon: 'pi pi-upload',
                routerLink: ['/fileupload']
            },
            {
                label: 'Angular.dev',
                icon: 'pi pi-external-link',
                target: '_blank',
                url: 'https://angular.dev'
            }
        ];
    }
}
