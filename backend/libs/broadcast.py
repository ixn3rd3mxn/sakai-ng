"""One poll loop per feed, shared by every SSE connection to it.

The shape every live feed on the automate dashboard uses: a connection is a
queue on a subscriber set, one loop polls upstream and pushes to every queue
when the payload changes, and the loop runs only while at least one queue
exists - a feed nobody is watching polls nothing at all. `libs.agents` and
the counters in `libs.call_stats` carry their own copy of this because they
predate it and have loop-specific wrinkles (a midnight wake-up, a stale
fast-path); the per-table feeds in `libs.call_log` and the hourly chart in
`libs.call_stats` are plain enough to share one.

Sharing the loop is what makes the card switches on the dashboard mean
something: a card switched off closes its stream, and when the last stream
on a feed closes, that feed's upstream goes quiet.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


def signature(payload: dict) -> str:
    """Stable hash of a payload, for change detection.

    Callers include `fetched_at` in what they hash on purpose: an idle board
    then still receives a frame each poll and can prove it is alive - see the
    note on `_signature` in libs.call_stats.
    """
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


class Feed:
    """The subscriber set and poll loop for one feed.

    `fetch` produces the payload and must not raise for an unreachable
    upstream - each fetcher degrades to an "unavailable" payload of its own
    shape. One that does raise is logged and retried after `retry_seconds`
    rather than killing the loop for every board on it.

    `interval` is asked, after each poll, how long to sleep before the next -
    it is handed the payload so it can back off when the feed was unreadable,
    or wake early for a rollover.
    """

    def __init__(
        self,
        name: str,
        fetch: Callable[[], Awaitable[dict]],
        interval: Callable[[dict], float],
        retry_seconds: float,
    ) -> None:
        self.name = name
        self._fetch = fetch
        self._interval = interval
        self._retry_seconds = retry_seconds
        self._subscribers: set[asyncio.Queue] = set()
        self._poller: Optional[asyncio.Task] = None
        self._latest: Optional[dict] = None
        self._latest_signature: Optional[str] = None

    async def _poll_loop(self) -> None:
        while True:
            try:
                payload = await self._fetch()
            except Exception:
                logger.exception("%s poll failed", self.name)
                await asyncio.sleep(self._retry_seconds)
                continue

            digest = signature(payload)
            if digest != self._latest_signature:
                self._latest, self._latest_signature = payload, digest
                for queue in list(self._subscribers):
                    if queue.full():
                        # A slow client should receive the newest payload,
                        # not a superseded one - drop what is queued rather
                        # than skip.
                        try:
                            queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                    queue.put_nowait(payload)
            await asyncio.sleep(self._interval(payload))

    async def subscribe(self) -> asyncio.Queue:
        """Register for pushes, starting the poll loop if it is idle."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._subscribers.add(queue)
        if self._poller is None or self._poller.done():
            self._poller = asyncio.create_task(self._poll_loop(), name=f"{self.name}-poll")
        # Hand a newly connected client the current state at once instead of
        # making it wait for the next change.
        if self._latest is not None:
            queue.put_nowait(self._latest)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers.discard(queue)
        if not self._subscribers and self._poller is not None:
            self._poller.cancel()
            self._poller = None

    def close(self) -> None:
        """Stop the loop regardless of subscribers - process shutdown."""
        if self._poller is not None:
            self._poller.cancel()
            self._poller = None

    def reset(self) -> None:
        """Forget everything, for tests."""
        self.close()
        self._subscribers.clear()
        self._latest = None
        self._latest_signature = None
