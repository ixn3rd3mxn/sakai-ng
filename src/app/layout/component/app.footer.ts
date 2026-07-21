import { Component } from '@angular/core';

@Component({
    standalone: true,
    selector: 'app-footer',
    template: `<div class="layout-footer">
        credits by
        <a href="https://v21.angular.dev/" target="_blank" rel="noopener noreferrer" class="text-primary font-bold hover:underline">angular</a>●
        <a href="https://v21.primeng.org/" target="_blank" rel="noopener noreferrer" class="text-primary font-bold hover:underline">primeng</a>●
        <a href="https://github.com/primefaces/sakai-ng" target="_blank" rel="noopener noreferrer" class="text-primary font-bold hover:underline">sakaing</a>

    </div>`
})
export class AppFooter {}
