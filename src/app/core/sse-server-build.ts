import { inject } from '@angular/core';
import { AppUpdateService } from './app-update.service';

/**
 * Forwards the `server` frame every SSE endpoint opens with (see
 * `_sse` in backend/main.py) to {@link AppUpdateService}.
 *
 * A function rather than a base class because these services have nothing else
 * in common, and this must not become a reason for them to share one.
 *
 * Call it from a field initialiser - it injects, so it needs an injection
 * context - and apply the result to each EventSource as it is created:
 *
 * ```ts
 * private readonly watchServerBuild = serverBuildListener();
 * // ...
 * const source = new EventSource(url);
 * this.watchServerBuild(source);
 * ```
 */
export function serverBuildListener(): (source: EventSource) => void {
    const updates = inject(AppUpdateService);
    return (source) => source.addEventListener('server', (event: MessageEvent<string>) => updates.reportServerBuild(event.data));
}
