import { isPlatformBrowser } from '@angular/common';
import { Injectable, effect, signal, computed, inject, PLATFORM_ID } from '@angular/core';

function getPreferredDarkTheme(platformId: object): boolean {
    if (!isPlatformBrowser(platformId)) {
        return false;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const LAYOUT_CONFIG_STORAGE_KEY = 'layoutConfig';

function getStoredLayoutConfig(platformId: object): Partial<LayoutConfig> | null {
    if (!isPlatformBrowser(platformId)) {
        return null;
    }

    try {
        const raw = localStorage.getItem(LAYOUT_CONFIG_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function getInitialLayoutConfig(platformId: object): LayoutConfig {
    const stored = getStoredLayoutConfig(platformId);

    return {
        preset: stored?.preset ?? 'Aura',
        primary: stored?.primary ?? 'blue',
        surface: stored?.surface ?? null,
        darkTheme: stored?.darkTheme ?? getPreferredDarkTheme(platformId),
        menuMode: stored?.menuMode ?? 'static'
    };
}

export interface LayoutConfig {
    preset: string;
    primary: string;
    surface: string | undefined | null;
    darkTheme: boolean;
    menuMode: string;
}

interface LayoutState {
    staticMenuDesktopInactive: boolean;
    overlayMenuActive: boolean;
    configSidebarVisible: boolean;
    mobileMenuActive: boolean;
    menuHoverActive: boolean;
    activePath: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class LayoutService {
    private platformId = inject(PLATFORM_ID);

    layoutConfig = signal<LayoutConfig>(getInitialLayoutConfig(this.platformId));

    layoutState = signal<LayoutState>({
        staticMenuDesktopInactive: false,
        overlayMenuActive: false,
        configSidebarVisible: false,
        mobileMenuActive: false,
        menuHoverActive: false,
        activePath: null
    });

    theme = computed(() => (this.layoutConfig().darkTheme ? 'light' : 'dark'));

    isSidebarActive = computed(() => this.layoutState().overlayMenuActive || this.layoutState().mobileMenuActive);

    isDarkTheme = computed(() => this.layoutConfig().darkTheme);

    getPrimary = computed(() => this.layoutConfig().primary);

    getSurface = computed(() => this.layoutConfig().surface);

    isOverlay = computed(() => this.layoutConfig().menuMode === 'overlay');

    transitionComplete = signal<boolean>(false);

    private initialized = false;

    constructor() {
        effect(() => {
            const config = this.layoutConfig();

            if (!this.initialized || !config) {
                this.initialized = true;
                this.toggleDarkMode(config);
                return;
            }

            this.handleDarkModeTransition(config);
        });

        effect(() => {
            const config = this.layoutConfig();

            if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem(LAYOUT_CONFIG_STORAGE_KEY, JSON.stringify(config));
            }
        });
    }

    private handleDarkModeTransition(config: LayoutConfig): void {
        const supportsViewTransition = 'startViewTransition' in document;

        if (supportsViewTransition) {
            this.startViewTransition(config);
        } else {
            this.toggleDarkMode(config);
        }
    }

    private startViewTransition(config: LayoutConfig): void {
        document.startViewTransition(() => {
            this.toggleDarkMode(config);
        });
    }

    toggleDarkMode(config?: LayoutConfig): void {
        const _config = config || this.layoutConfig();
        if (_config.darkTheme) {
            document.documentElement.classList.add('app-dark');
        } else {
            document.documentElement.classList.remove('app-dark');
        }
    }

    onMenuToggle() {
        if (this.isOverlay()) {
            this.layoutState.update((prev) => ({ ...prev, overlayMenuActive: !this.layoutState().overlayMenuActive }));
        }

        if (this.isDesktop()) {
            this.layoutState.update((prev) => ({ ...prev, staticMenuDesktopInactive: !this.layoutState().staticMenuDesktopInactive }));
        } else {
            this.layoutState.update((prev) => ({ ...prev, mobileMenuActive: !this.layoutState().mobileMenuActive }));
        }
    }

    showConfigSidebar() {
        this.layoutState.update((prev) => ({ ...prev, configSidebarVisible: true }));
    }

    hideConfigSidebar() {
        this.layoutState.update((prev) => ({ ...prev, configSidebarVisible: false }));
    }

    isDesktop() {
        return window.innerWidth > 991;
    }

    isMobile() {
        return !this.isDesktop();
    }
}
