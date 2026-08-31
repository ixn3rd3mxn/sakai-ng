import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';

// Everything except the shared layout shell is loaded on demand. Importing
// the page components eagerly here pulled the whole sakai demo (dashboard,
// landing, documentation) into the initial bundle, which every visitor paid
// for before any route rendered - including /report, which uses none of it.
export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        children: [
            { path: '', loadComponent: () => import('./app/pages/dashboard/dashboard').then((m) => m.Dashboard) },
            { path: 'home', loadComponent: () => import('./app/pages/home/dashboard').then((m) => m.HomeComponent) },
            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'report', loadChildren: () => import('./app/pages/report.routes') },
            { path: 'map', loadChildren: () => import('./app/pages/map.routes') },
            { path: 'documentation', loadComponent: () => import('./app/pages/documentation/documentation').then((m) => m.Documentation) },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') }
        ]
    },
    { path: 'landing', loadComponent: () => import('./app/pages/landing/landing').then((m) => m.Landing) },
    { path: 'notfound', loadComponent: () => import('./app/pages/notfound/notfound').then((m) => m.Notfound) },
    { path: '**', redirectTo: '/notfound' }
];
