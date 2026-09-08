import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppUpdateNotice } from './app/core/app-update-notice';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, AppUpdateNotice],
    // Outside the router outlet on purpose: the notice has to survive route
    // changes, and it has to appear on the login and landing pages too.
    template: `<router-outlet></router-outlet><app-update-notice />`
})
export class AppComponent {}
