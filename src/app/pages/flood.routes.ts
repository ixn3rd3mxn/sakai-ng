import { Routes } from '@angular/router';
import { FloodIntakeComponent } from './flood-intake/flood-intake';

// Its own child route file, matching report.routes.ts and map.routes.ts, so
// the whole feature is one lazy chunk that visitors to /report never pay for.
//
// "intake" rather than a bare path: the drawer is addressed by a query
// parameter on this route, and a sibling page (a flood summary) can be added
// later without moving the URL operators will have bookmarked.
export default [
    { path: 'intake', data: { breadcrumb: 'รับแจ้งอุทกภัย' }, component: FloodIntakeComponent },
    { path: '', redirectTo: 'intake', pathMatch: 'full' },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
