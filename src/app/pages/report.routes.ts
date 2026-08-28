import { Routes } from '@angular/router';
import { EmergencyDispatchDashboard } from './dashboardclone/dispatch-dashboard';
import { IncidentHistoryComponent } from './incident-history/incident-history';
import { Empty } from './empty/empty';

export default [
    { path: 'dashboard', data: { breadcrumb: 'Dashboard' }, component: EmergencyDispatchDashboard },
    { path: 'manual-dashboard', data: { breadcrumb: 'Manual Dashboard' }, component: Empty },
    { path: 'summary', data: { breadcrumb: 'Summary' }, component: IncidentHistoryComponent },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
