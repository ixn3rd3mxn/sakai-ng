import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule],
    template: `<ul class="layout-menu">
        @for (item of model; track item.label) {
            @if (!item.separator) {
                <li app-menuitem [item]="item" [root]="true"></li>
            } @else {
                <li class="menu-separator"></li>
            }
        }
    </ul> `,
})
export class AppMenu {
    model: MenuItem[] = [];

    ngOnInit() {
        this.model = [
            {
                label: 'Home',
                items: [{ label: 'หน้าหลัก', icon: 'pi pi-fw pi-home', routerLink: ['/home'] }]
            },
            {
                label: 'Auto EMS CALL Report',
                items: [
                    { label: 'แดชบอร์ด', icon: 'pi pi-fw pi-objects-column', routerLink: ['/report/manual-dashboard'] },
                ]
            },
            {
                label: 'Manual EMS CALL Report',
                items: [
                    { label: 'แดชบอร์ด', icon: 'pi pi-fw pi-objects-column', routerLink: ['/report/dashboard'] },
                    { label: 'สรุปผล', icon: 'pi pi-fw pi-slack', routerLink: ['/report/summary'] },
                ]
            },
            {
                label: 'Map',
                items: [
                    { label: 'แผนที่', icon: 'pi pi-fw pi-map', routerLink: ['/map/view'] },
                    { label: 'สรุปผล', icon: 'pi pi-fw pi-slack', routerLink: ['/map/summary'] },
                    { label: 'จัดการข้อมูล', icon: 'pi pi-fw pi-wrench', routerLink: ['/map/manage'] }
                ]
            },
        ];
    }
}
