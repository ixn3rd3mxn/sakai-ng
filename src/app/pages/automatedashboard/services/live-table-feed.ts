import { computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { deploySignalListener } from '@/app/core/sse-deploy-signals';
import { resilientEventSource } from '@/app/core/sse-reconnect';
import { FeedHealth } from '../feed-health.types';
import { feedHealthMessage } from '../format-utils';

/**
 * The state and transport one log table needs, opened on demand.
 *
 * Shared by the two call-log services, which differ only in URL, event name
 * and payload shape. Call it from a field initialiser: it injects (through
 * `deploySignalListener`), so it needs an injection context.
 *
 * Nothing is opened until `setWanted(true)`. The page calls that from an
 * effect on the card's on/off switch, so a table the board has switched off
 * holds no connection - and, because the backend polls a feed only while
 * someone is subscribed, its upstream goes quiet too.
 */
export function liveTableFeed<T extends { health?: FeedHealth }>(url: string, event: string) {
    // One line per stream, so a deploy of either half is noticed on
    // whichever board happens to be open.
    const watchDeploySignals = deploySignalListener();
    let subscription: Subscription | null = null;

    const _summary = signal<T | null>(null);
    const _loading = signal<boolean>(true);

    // Reconnection is not left to the browser - see the note in
    // AgentsDataService and the comment on `resilientEventSource`.
    const stream = () =>
        new Observable<T>((subscriber) => {
            // Runs for every source the helper opens, not only the first: a
            // rebuilt EventSource starts with no listeners.
            return resilientEventSource(url, (source) => {
                watchDeploySignals(source);
                source.addEventListener(event, (frame: MessageEvent<string>) => {
                    try {
                        subscriber.next(JSON.parse(frame.data) as T);
                    } catch {
                        // ignore malformed frames
                    }
                });
            });
        });

    return {
        summary: _summary.asReadonly(),
        loading: _loading.asReadonly(),

        /** Short Thai line for the table header, or `''` when the feed is
         *  fine. */
        healthMessage: computed(() => (_loading() ? '' : feedHealthMessage(_summary()?.health))),

        /** Open or close the stream. Idempotent, so an effect can call it on
         *  every change of the switch.
         *
         *  Closing also drops the last payload and returns to `loading`: a
         *  table switched back on hours later must show a skeleton and then
         *  fresh rows, not a stale list that looks current. The backend hands
         *  a new subscriber its latest payload at once, so the skeleton is
         *  brief. */
        setWanted(wanted: boolean): void {
            if (wanted && subscription === null) {
                subscription = stream().subscribe((summary) => {
                    _summary.set(summary);
                    _loading.set(false);
                });
            } else if (!wanted && subscription !== null) {
                subscription.unsubscribe();
                subscription = null;
                _summary.set(null);
                _loading.set(true);
            }
        },

        destroy(): void {
            subscription?.unsubscribe();
            subscription = null;
        }
    };
}
