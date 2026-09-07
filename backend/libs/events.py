"""Wake-up bus for the SSE connections that read `incidents`.

Two halves, and the distinction between them is the whole point of this
module:

*   `notify_incidents_changed()` wakes every connection **in this process**.
    It is called straight from `POST /api/incidents` so the dispatcher who
    just saved sees their own entry without waiting for anything.

*   `start_watcher()` tails a MongoDB change stream on `incidents` and calls
    the same notifier for writes made **anywhere in the cluster**. Production
    runs several replicas behind the load balancer, so the operator who saves
    and the operator watching a dashboard are usually not on the same process
    - the local notify above reaches neither of them reliably. Before this
    existed, a save by A simply never reached B's board.

Neither is what makes a stream *correct*. Every consumer also rebuilds on a
staleness floor (see `main.WATCHED_REBUILD_FLOOR`), so a coalesced wake, a
dropped change-stream cursor, or a deployment whose database does not support
change streams at all only ever means a later refresh - never a board that
sits on stale numbers forever. That floor is the guarantee; this module is
the latency optimisation on top of it.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Optional

from pymongo.errors import PyMongoError

from libs.configs import db

logger = logging.getLogger(__name__)

_subscribers: set[asyncio.Queue] = set()

# Only the operations that can change what an aggregation returns. The
# default stream also reports `invalidate`/`drop`, which would wake every
# board to rebuild an identical payload.
_WATCH_PIPELINE = [{"$match": {"operationType": {"$in": ["insert", "update", "replace", "delete"]}}}]

# How long `try_next()` waits for a change before returning None. It is the
# shutdown granularity too: the thread cannot notice `_stopping` while it is
# blocked inside the driver.
_AWAIT_MS = 1000

_watcher: Optional[threading.Thread] = None
_stopping = threading.Event()
# Set only while a change stream is actually open and delivering. Consumers
# read it through `watching()` to decide how hard they have to poll.
_watching = threading.Event()


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


def watching() -> bool:
    """True while the cluster-wide change stream is live.

    False on a standalone mongod (change streams need a replica set, so a
    developer machine running plain `mongod` never gets one), while the
    cursor is being re-established, and before startup has finished.
    """
    return _watching.is_set()


def _watch_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Tail `incidents` forever, forwarding every write into this process.

    Runs on its own thread rather than the event loop because pymongo is
    synchronous: `try_next()` blocks for up to `_AWAIT_MS`, which on the loop
    would stall every other connection for a second at a time. A dedicated
    thread rather than `run_in_threadpool` because this never returns, and
    parking it in the shared pool would take one of the forty slots that the
    aggregation rebuilds run in.
    """
    delay = 2
    while not _stopping.is_set():
        try:
            with db.incidents.watch(pipeline=_WATCH_PIPELINE, max_await_time_ms=_AWAIT_MS) as stream:
                logger.info("watching incidents for cluster-wide changes")
                _watching.set()
                delay = 2
                while not _stopping.is_set():
                    if stream.try_next() is None:
                        continue  # nothing within _AWAIT_MS; loop re-checks _stopping
                    # The queues coalesce, so a burst of writes costs one
                    # rebuild per connection, not one per change.
                    loop.call_soon_threadsafe(notify_incidents_changed)
        except PyMongoError as exc:
            # Includes the permanent case - a standalone mongod rejects
            # `watch()` outright. Retrying costs one failed command per
            # minute and keeps a replica set that is merely mid-election
            # from permanently losing its watcher, and the staleness floor
            # covers the boards either way.
            logger.warning("incident change stream unavailable (%s); retrying in %ss", exc, delay)
        finally:
            _watching.clear()

        if _stopping.wait(timeout=delay):
            break
        delay = min(delay * 2, 60)


def start_watcher(loop: asyncio.AbstractEventLoop) -> None:
    """Start the change-stream thread. Idempotent."""
    global _watcher
    if _watcher is not None and _watcher.is_alive():
        return
    _stopping.clear()
    _watcher = threading.Thread(target=_watch_loop, args=(loop,), name="incidents-watch", daemon=True)
    _watcher.start()


def stop_watcher() -> None:
    """Ask the watcher to finish, and wait long enough for the in-flight
    `try_next()` to return. Daemon thread, so a slow exit here can never hold
    the process open - the join is courtesy, not a requirement."""
    global _watcher
    _stopping.set()
    if _watcher is not None:
        _watcher.join(timeout=_AWAIT_MS / 1000 + 1)
        _watcher = None
    _watching.clear()
