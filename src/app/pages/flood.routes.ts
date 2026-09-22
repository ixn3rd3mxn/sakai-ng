import { CanDeactivateFn, Routes } from '@angular/router';
import { FloodIntakeComponent } from './flood-intake/flood-intake';

// The drawer is opened and closed by the ?case= query parameter, so the
// browser's Back button closes it like any other navigation - and, unguarded,
// throws away whatever was typed without the question the x button asks.
// Guards only run on query-param changes when the route says so.
const confirmLeave: CanDeactivateFn<FloodIntakeComponent> = (component) => component.canLeave();

// Its own child route file, matching report.routes.ts and map.routes.ts, so
// the whole feature is one lazy chunk that visitors to /report never pay for.
//
// "intake" rather than a bare path: the drawer is addressed by a query
// parameter on this route, and a sibling page (a flood summary) can be added
// later without moving the URL operators will have bookmarked.
export default [
    { path: 'intake', data: { breadcrumb: 'รับแจ้งอุทกภัย' }, component: FloodIntakeComponent, canDeactivate: [confirmLeave], runGuardsAndResolvers: 'paramsOrQueryParamsChange' },
    { path: '', redirectTo: 'intake', pathMatch: 'full' },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
