import { Routes } from '@angular/router';
import { ComingSoon } from './comingsoon/comingsoon';

// One path per menu entry even though all three render the same placeholder.
//
// A single shared path would work, but app.menuitem applies routerLinkActive
// with exact matching, so all three Map entries would highlight together the
// moment any one of them was clicked. Separate paths also mean each page can be
// built later by swapping its component here, with the URL already settled.
export default [
    { path: 'view', data: { breadcrumb: 'แผนที่' }, component: ComingSoon },
    { path: 'summary', data: { breadcrumb: 'สรุปผล' }, component: ComingSoon },
    { path: 'manage', data: { breadcrumb: 'จัดการข้อมูล' }, component: ComingSoon },
    { path: '**', redirectTo: '/notfound' }
] as Routes;
