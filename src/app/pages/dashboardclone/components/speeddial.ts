import { Component, inject, OnInit } from '@angular/core';
import { SpeedDialModule } from 'primeng/speeddial';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
    standalone: true,
    selector: 'app-speed-dial',
    imports: [ToastModule, SpeedDialModule, DialogModule, ButtonModule, SelectModule, FormsModule],
    template: `<p-toast />
    <p-speeddial [model]="items" direction="up" [style]="{ position: 'fixed', right: '1rem', bottom: '1rem' }" [tooltipOptions]="{ tooltipPosition: 'left' }" />
    
    <p-dialog header="บันทึกข้อมูล" [(visible)]="display" [breakpoints]="{ '960px': '75vw' }" [style]="{ width: '30vw' }" [modal]="true">
        <p-select [(ngModel)]="dropdownValue" [options]="dropdownValues" optionLabel="name" placeholder="Select" class="w-full" appendTo="body" />
        <ng-template #footer>
            <p-button label="Save" (click)="close()" />
        </ng-template>
    </p-dialog>`,
    providers: [MessageService]
})
export class SpeedDial implements OnInit {
    private messageService = inject(MessageService);
    items: MenuItem[] | null = null;
    display: boolean = false;
    dropdownValue: any = null;

    dropdownValues = [
        { name: 'New York', code: 'NY' },
        { name: 'Rome', code: 'RM' },
        { name: 'London', code: 'LDN' },
        { name: 'Istanbul', code: 'IST' },
        { name: 'Paris', code: 'PRS' }
    ];

    close() {
        this.display = false;
    }

    ngOnInit() {
        this.items = [
            {
                label: 'บันทึกข้อมูล',
                icon: 'pi pi-pencil',
                command: () => {
                    this.display = true;
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
