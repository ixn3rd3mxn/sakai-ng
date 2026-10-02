import { isPlatformBrowser } from '@angular/common';
import { Injectable, effect, signal, computed, inject, PLATFORM_ID } from '@angular/core';

function getPreferredDarkTheme(platformId: object): boolean {
    if (!isPlatformBrowser(platformId)) {
        return false;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

const LAYOUT_CONFIG_STORAGE_KEY = 'layoutConfig';

// Before light and dark mode each had their own surface, one `surface` key
// covered both. Still read so an existing choice carries over to both modes.
type StoredLayoutConfig = Partial<LayoutConfig> & { surface?: string | null };

function getStoredLayoutConfig(platformId: object): StoredLayoutConfig | null {
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

const MENU_STATE_STORAGE_KEY = 'layoutMenuState';

function getStoredStaticMenuDesktopInactive(platformId: object): boolean {
    if (!isPlatformBrowser(platformId)) {
        return false;
    }

    try {
        const raw = localStorage.getItem(MENU_STATE_STORAGE_KEY);
        return raw ? JSON.parse(raw)?.staticMenuDesktopInactive === true : false;
    } catch {
        return false;
    }
}

// What the palette window's "ค่าเริ่มต้น" button restores. darkTheme is not
// here: it has its own topbar toggle and defaults to the OS preference.
export const DEFAULT_LAYOUT_CONFIG: Omit<LayoutConfig, 'darkTheme'> = {
    preset: 'Aura',
    primary: 'blue',
    surfaceLight: 'slate',
    surfaceDark: 'zinc',
    menuMode: 'static'
};

function getInitialLayoutConfig(platformId: object): LayoutConfig {
    const stored = getStoredLayoutConfig(platformId);

    return {
        preset: stored?.preset ?? DEFAULT_LAYOUT_CONFIG.preset,
        primary: stored?.primary ?? DEFAULT_LAYOUT_CONFIG.primary,
        surfaceLight: stored?.surfaceLight ?? stored?.surface ?? DEFAULT_LAYOUT_CONFIG.surfaceLight,
        surfaceDark: stored?.surfaceDark ?? stored?.surface ?? DEFAULT_LAYOUT_CONFIG.surfaceDark,
        darkTheme: stored?.darkTheme ?? getPreferredDarkTheme(platformId),
        menuMode: stored?.menuMode ?? DEFAULT_LAYOUT_CONFIG.menuMode
    };
}

export interface LayoutConfig {
    preset: string;
    primary: string;
    surfaceLight: string;
    surfaceDark: string;
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
        staticMenuDesktopInactive: getStoredStaticMenuDesktopInactive(this.platformId),
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

    // The surface for the mode currently on screen.
    getSurface = computed(() => (this.layoutConfig().darkTheme ? this.layoutConfig().surfaceDark : this.layoutConfig().surfaceLight));

    isOverlay = computed(() => this.layoutConfig().menuMode === 'overlay');

    transitionComplete = signal<boolean>(false);

    private initialized = false;

    private appliedDarkTheme: boolean | undefined;

    constructor() {
        effect(() => {
            const config = this.layoutConfig();

            if (!this.initialized || !config) {
                this.initialized = true;
                this.appliedDarkTheme = config?.darkTheme;
                this.toggleDarkMode(config);
                return;
            }

            // Only a light/dark switch gets the view transition. While one runs,
            // every click lands on <html>, so running it for palette changes
            // made the palette window read a quick second click as an outside
            // click and close.
            if (config.darkTheme === this.appliedDarkTheme) {
                return;
            }

            this.appliedDarkTheme = config.darkTheme;
            this.handleDarkModeTransition(config);
        });

        effect(() => {
            const config = this.layoutConfig();

            if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem(LAYOUT_CONFIG_STORAGE_KEY, JSON.stringify(config));
            }
        });

        effect(() => {
            const staticMenuDesktopInactive = this.layoutState().staticMenuDesktopInactive;

            if (isPlatformBrowser(this.platformId)) {
                localStorage.setItem(MENU_STATE_STORAGE_KEY, JSON.stringify({ staticMenuDesktopInactive }));
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
