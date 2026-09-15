import { Injectable, Signal, computed, signal } from '@angular/core';

/** The cards on this page that can be switched off. The three stat rows and
 *  the agent roster cannot: they are what a wall display exists to show. */
export type ToggleableCard = 'hourly' | 'missed' | 'call-log';

const STORAGE_KEY = 'automate-dashboard.cards-off';

/**
 * Which of the optional cards are switched off, remembered per browser.
 *
 * Exists for the wall-mounted board. Its screen shows the stat rows and the
 * roster; the three cards below the fold are never scrolled to there, yet the
 * board held their stream open around the clock. Switching those cards off on
 * that one browser closes the connection, and - because the backend only
 * polls a feed while someone is subscribed to it - the call-log upstream is
 * left alone until a desk PC opens the page and actually wants it.
 *
 * Everything is on by default. There is one wall display and many desk users;
 * configuring the wall once costs three clicks, while a card that is off by
 * default is a card a desk user has to discover is missing. It also makes the
 * failure direction safe: storage that is wiped (a kiosk profile cleared on
 * exit) falls back to "more than needed", never to "silently missing".
 *
 * Stored as the list of cards that are *off*, so an absent key and a cleared
 * key both mean the default without a migration.
 */
@Injectable({ providedIn: 'root' })
export class CardVisibilityService {
    private readonly off = signal<ReadonlySet<ToggleableCard>>(readStored());

    private readonly enabledSignals = new Map<ToggleableCard, Signal<boolean>>();

    /** Stable per card, so a template can call it inside a binding without
     *  making a new computed on every change detection pass. */
    enabled(card: ToggleableCard): Signal<boolean> {
        let existing = this.enabledSignals.get(card);
        if (!existing) {
            existing = computed(() => !this.off().has(card));
            this.enabledSignals.set(card, existing);
        }
        return existing;
    }

    setEnabled(card: ToggleableCard, enabled: boolean): void {
        const next = new Set(this.off());
        if (enabled) next.delete(card);
        else next.add(card);
        this.off.set(next);
        try {
            if (next.size === 0) localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
        } catch {
            // Private windows and locked-down kiosk profiles throw on write.
            // The card still switches for this session; it just is not
            // remembered, which beats refusing to switch it at all.
        }
    }
}

const KNOWN: ReadonlySet<string> = new Set<ToggleableCard>(['hourly', 'missed', 'call-log']);

/** The stored off-list, or nothing when there is nothing usable stored.
 *
 *  Guarded because reading localStorage throws outright in some contexts, and
 *  a garbage value must not blank the board - unknown names are dropped so a
 *  card renamed in a later release comes back on rather than staying off
 *  under a key nothing matches any more. */
function readStored(): ReadonlySet<ToggleableCard> {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((name): name is ToggleableCard => typeof name === 'string' && KNOWN.has(name)));
    } catch {
        return new Set();
    }
}
