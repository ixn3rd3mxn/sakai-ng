"""Frontend deploy announcements, pushed down every open SSE connection.

The problem this solves: a board that has been open all shift has no way to
learn that Vercel has shipped a new frontend. Vercel pushes nothing, and the
tab holds no connection to it - so without this the only mechanism is the
client re-fetching `version.json` on its own timer, which means a deploy is
noticed some minutes after it happens.

The backend, though, already has a connection to every open board. So the
Vercel build tells this process what it just built (POST /api/deployments,
from the `postbuild` script), and this module hands that down the streams the
boards already hold. Latency goes from minutes to about as long as the POST
takes.

What is deliberately *not* here: any authority. The frame this sends is a
hint meaning "go and look now", and the client answers it by re-fetching
`version.json` from the CDN and believing that instead. It has to work that
way, because the build finishing is not the same instant as the deployment
going live on the domain - announce during that gap and a client that trusted
the frame would reload straight back onto the old bundle. Making the frame a
nudge rather than a fact also means a lost, duplicated or replayed
announcement costs one wasted conditional GET and nothing else.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_subscribers: set[asyncio.Queue] = set()

# The last build announced, so a board that connects *after* the announcement
# still learns about it - it is handed this in the opening frame rather than
# waiting for the next deploy.
_current: Optional[str] = None


def subscribe() -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    _subscribers.discard(queue)


def current() -> Optional[str]:
    return _current


def announce(build: str) -> bool:
    """Tell every open stream that `build` was just deployed.

    Returns False when this build was already the current one. The build step
    retries the POST (the backend sleeps on a free tier, so the first attempt
    often wakes it and times out), and a retry that arrived late must not send
    a second wave of boards off to re-check for nothing.
    """
    global _current
    if build == _current:
        return False
    _current = build

    for queue in list(_subscribers):
        # Same coalescing as the incident bus: a connection that has not yet
        # read its pending hint does not need a second one. Safe here in a way
        # it would not be for data, because the hint carries no information -
        # the client goes and reads the authoritative file either way.
        if queue.full():
            continue
        queue.put_nowait(build)

    logger.info("announced frontend build %s to %d open stream(s)", build, len(_subscribers))
    return True


def reset() -> None:
    """Drop all state. Tests only."""
    global _current
    _current = None
    _subscribers.clear()
