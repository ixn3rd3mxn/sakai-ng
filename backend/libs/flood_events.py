"""In-process wake-up for the flood-intake SSE connections.

A separate subscriber set from `libs.events` on purpose. That one is shared by
the dashboard and incident-history streams, which read `incidents`; waking
them every time an operator saves a flood case would make all three EMS report
pages re-run their aggregations - the dashboard summary is a 30-branch
`$facet` plus a full-month scan - for a write that cannot possibly change
their output. During a flood that write happens every few seconds.

Same contract as `libs.events` otherwise: a wake-up is an optimisation, never
what makes the stream correct. Every connection still polls on a timeout, so a
coalesced, missed, or cross-process wake only means a slightly later refresh.
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


def notify_flood_cases_changed() -> None:
    for queue in list(_subscribers):
        if queue.full():
            continue  # already has a pending wake-up; writes coalesce
        queue.put_nowait(None)
