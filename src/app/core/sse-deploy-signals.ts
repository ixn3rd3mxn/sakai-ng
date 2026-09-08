import { inject } from '@angular/core';
import { AppUpdateService } from './app-update.service';

/**
 * Wires the two software-level frames every SSE endpoint sends (see `_sse` in
 * backend/main.py) to {@link AppUpdateService}:
 *
 *   `server` - opens the connection, names the backend deployment.
 *   `deploy` - arrives mid-stream when the frontend has been redeployed.
 *
 * This is what makes the notice feel immediate. The boards already hold these
 * connections open all shift, so a deploy reaches them over a socket that
 * already exists - no extra connection, no polling, and nothing added to an
 * idle stream but a few dozen bytes when something actually happens.
 *
 * A function rather than a base class because these services have nothing else
 * in common, and this must not become a reason for them to share one.
 *
 * Call it from a field initialiser - it injects, so it needs an injection
 * context - and apply the result to each EventSource as it is created:
 *
 * ```ts
 * private readonly watchDeploySignals = deploySignalListener();
 * // ...
 * const source = new EventSource(url);
 * this.watchDeploySignals(source);
 * ```
 */
export function deploySignalListener(): (source: EventSource) => void {
    const updates = inject(AppUpdateService);
    return (source) => {
        source.addEventListener('server', (event: MessageEvent<string>) => updates.reportServerBuild(event.data));
        source.addEventListener('deploy', () => updates.onDeployAnnounced());
    };
}
