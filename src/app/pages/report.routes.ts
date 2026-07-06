import { Routes } from '@angular/router';
import { DashboardCloneComponent } from './dashboardclone/dashboard';
import { TableDemoClone } from './uikit/tabledemoclone';

export default [
    { path: 'dashboard', data: { breadcrumb: 'Dashboard' }, component: DashboardCloneComponent },
    { path: 'summary', data: { breadcrumb: 'Summary' }, component: TableDemoClone },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
