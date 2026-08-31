import { Component } from '@angular/core';

/** Placeholder for a menu entry that is routed but not built yet.
 *
 *  Shared by every unbuilt route rather than duplicated per page: what it says
 *  is the same in each case, and the route paths already differ, which is what
 *  keeps the menu highlighting the right entry.
 *
 *  Its job is to make "not built yet" obvious. Pointing those menu items at
 *  `/` instead - as they did - sent the operator to the dashboard, which looks
 *  exactly like a page that loaded correctly and left them wondering what they
 *  had clicked.
 */
@Component({
    standalone: true,
    selector: 'app-coming-soon',
    template: `
        <div class="card flex flex-col items-center justify-center gap-4 text-muted-color" style="min-height: 60vh; margin-bottom: 0.25rem">
            <i class="pi pi-wrench text-6xl opacity-30"></i>
            <span class="text-2xl font-medium">กำลังทำ</span>
        </div>
    `
})
export class ComingSoon {}
