import { Component, inject, signal } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '@/app/layout/service/layout.service';
import { AppUpdateService } from '@/app/core/app-update.service';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, StyleClassModule, AppConfigurator],
    template: ` <div class="layout-topbar">
        <div class="layout-topbar-logo-container">
            <button class="layout-menu-button layout-topbar-action" (click)="layoutService.onMenuToggle()">
                <i class="pi pi-bars"></i>
            </button>
            <a class="layout-topbar-logo" routerLink="/">
                <img src="demo/images/place/logo-512.png" alt="ศูนย์รับแจ้งเหตุและสั่งการการแพทย์ฉุกเฉิน อบจ.ปัตตานี" style="height: 35px; width: auto;" />
                <span class="logo-text-full">ศูนย์รับแจ้งเหตุและสั่งการการแพทย์ฉุกเฉิน อบจ.ปัตตานี</span>
                <span class="logo-text-short">ศูนย์รับแจ้งเหตุ</span>
            </a>
        </div>

        <div class="layout-topbar-actions">
            <div class="layout-config-menu">
                <!-- Only while an update is waiting behind a snooze. Thirty
                     minutes is a long time on a console that changes hands at
                     shift end, and an update nobody can see is one nobody can
                     act on - so "ไว้ก่อน" quietens the bar without erasing it. -->
                @if (updates.updateSnoozed()) {
                    <button type="button" class="layout-topbar-action relative" title="มีเวอร์ชันใหม่ของระบบ" aria-label="มีเวอร์ชันใหม่ของระบบ" (click)="updates.unsnooze()">
                        <i class="pi pi-sparkles"></i>
                        <span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary"></span>
                    </button>
                }
                <button type="button" class="layout-topbar-action" (click)="toggleDarkMode()">
                    <i [ngClass]="{ 'pi ': true, 'pi-moon': layoutService.isDarkTheme(), 'pi-sun': !layoutService.isDarkTheme() }"></i>
                </button>
                <button type="button" class="layout-topbar-action hidden! xl:inline-flex!" (click)="toggleFullscreen()">
                    <i [ngClass]="{ 'pi ': true, 'pi-window-maximize': !isFullscreen(), 'pi-window-minimize': isFullscreen() }"></i>
                </button>
                <div class="relative">
                    <button
                        class="layout-topbar-action layout-topbar-action-highlight"
                        pStyleClass="@next"
                        enterFromClass="hidden"
                        enterActiveClass="animate-scalein"
                        leaveToClass="hidden"
                        leaveActiveClass="animate-fadeout"
                        [hideOnOutsideClick]="true"
                    >
                        <i class="pi pi-palette"></i>
                    </button>
                    <app-configurator />
                </div>
            </div>

            <!-- <button class="layout-topbar-menu-button layout-topbar-action" pStyleClass="@next" enterFromClass="hidden" enterActiveClass="animate-scalein" leaveToClass="hidden" leaveActiveClass="animate-fadeout" [hideOnOutsideClick]="true">
                <i class="pi pi-ellipsis-v"></i>
            </button>

            <div class="layout-topbar-menu hidden lg:block">
                <div class="layout-topbar-menu-content">
                    <button type="button" class="layout-topbar-action">
                        <i class="pi pi-calendar"></i>
                        <span>Calendar</span>
                    </button>
                    <button type="button" class="layout-topbar-action">
                        <i class="pi pi-inbox"></i>
                        <span>Messages</span>
                    </button>
                    <button type="button" class="layout-topbar-action">
                        <i class="pi pi-user"></i>
                        <span>Profile</span>
                    </button>
                </div>
            </div> -->
        </div>
    </div>`
})
export class AppTopbar {
    items!: MenuItem[];

    layoutService = inject(LayoutService);
    readonly updates = inject(AppUpdateService);

    isFullscreen = signal(false);

    constructor() {
        this.isFullscreen.set(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', () => {
            this.isFullscreen.set(!!document.fullscreenElement);
        });
    }

    toggleDarkMode() {
        this.layoutService.layoutConfig.update((state) => ({
            ...state,
            darkTheme: !state.darkTheme
        }));
    }

    toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    }
}
