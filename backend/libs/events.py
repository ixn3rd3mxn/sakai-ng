"""In-process wake-up for SSE connections.

`libs.aggregations.build_summary` is cheap enough to poll, but polling alone
means up to one full interval of latency after a write. This gives each open
SSE connection a way to wake up immediately when an incident is written,
without changing what makes the stream correct: every connection still polls
on a timeout as a fallback, so a missed or coalesced wake (or a write that
landed on a different worker process, since this is process-local) is never
a correctness issue - just a slightly later refresh.
"""

from __future__ import annotations

import asyncio

_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subscribers.discard(queue)


def notify_incidents_changed() -> None:
    for queue in list(_subscribers):
        if queue.full():
            continue  # already has a pending wake-up; writes coalesce
        queue.put_nowait(None)
