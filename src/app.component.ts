import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppUpdateBanner } from './app/core/app-update-banner';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, AppUpdateBanner],
    // Outside the router outlet on purpose: the notice has to survive route
    // changes, and it has to appear on the login and landing pages too.
    template: `<router-outlet></router-outlet><app-update-banner />`
})
export class AppComponent {}
