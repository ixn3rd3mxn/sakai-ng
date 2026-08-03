import { Routes } from '@angular/router';
import { EmergencyDispatchDashboard } from './dashboardclone/dispatch-dashboard';
import { IncidentHistoryComponent } from './uikit/incident-history';

export default [
    { path: 'dashboard', data: { breadcrumb: 'Dashboard' }, component: EmergencyDispatchDashboard },
    { path: 'summary', data: { breadcrumb: 'Summary' }, component: IncidentHistoryComponent },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
