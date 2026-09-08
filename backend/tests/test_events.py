"""Offline tests for the `incidents` wake-up bus and the two SSE streams it
feeds.

No database and no network: `libs.events` reaches Mongo through exactly one
name (`events.db`) and the streams through `aggregations`, so both are
replaced with stubs here.

What is being protected, all of it written after the production symptom:

- **A save by one operator reaches every other operator's board.** This is
  the entire feature. It regressed invisibly the day the API went from one
  process to several replicas behind a load balancer: `notify_incidents_
  changed` only ever reached subscribers in its *own* process, and the
  streams rebuilt on nothing else, so B's dashboard sat on A's stale numbers
  indefinitely. Nothing in the code changed - the topology under it did.
- **The streams re-read Mongo on a floor, with no wake-up at all.** The
  floor is what makes the boards correct; the change stream only makes them
  fast. A test that notifies before asserting would pass against a build
  that had no floor left, which is the build that broke.
- **A database that cannot serve change streams is not an outage.** A
  developer running standalone `mongod` gets no watcher, and must still get
  live boards - via the tighter floor.
- **An idle board does not query per tick.** `build_summary` is a 30-branch
  `$facet` plus a full-month scan; the floor exists to bound staleness, not
  to turn every connection into a 2-second poller.
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import date, datetime
from types import SimpleNamespace

from pymongo.errors import PyMongoError

from tests import helpers  # noqa: F401  (path + dummy MONGO_URI, must precede libs)

import main
from libs import aggregations, deploys, events

DAY = date(2026, 9, 7)
NOW = datetime(2026, 9, 7, 10, 0, 0)


# --------------------------------------------------------------------------
# scaffolding
# --------------------------------------------------------------------------


class _FakeRequest:
    """Enough of starlette's Request for the stream generators: they ask
    nothing of it but whether the client has gone."""

    def __init__(self):
        self.disconnected = False

    async def is_disconnected(self) -> bool:
        return self.disconnected


class _FakeChangeStream:
    """Hands out a scripted list of changes, then blocks the way the real
    one does - `try_next` returning None is how the driver says "nothing
    within max_await_time_ms", not "the stream ended"."""

    def __init__(self, changes):
        self._changes = list(changes)
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.closed = True
        return False

    def try_next(self):
        if self._changes:
            return self._changes.pop(0)
        time.sleep(0.01)
        return None


def _stub_watch(result):
    """Point `events.db.incidents.watch` at `result`, which is either a
    callable returning a stream or an exception to raise."""

    def watch(**kwargs):
        if isinstance(result, BaseException):
            raise result
        return result()

    events.db = SimpleNamespace(incidents=SimpleNamespace(watch=watch))


class _StubSummary:
    """Stands in for `aggregations.build_summary` / `build_incident_history`,
    counting calls so the "does not query per tick" property is observable.

    Mutating `.total` is how these tests model a write that happened on
    another replica: the database now returns something different and this
    process was told nothing at all.
    """

    def __init__(self):
        self.total = 1
        self.calls = 0

    def summary(self, ctx):
        self.calls += 1
        return {
            "context": {"operational_day": str(DAY), "shift": "morning", "server_now": str(datetime.now())},
            "total": self.total,
        }

    def history(self, day, is_current, server_now):
        self.calls += 1
        return {"context": {"operational_day": str(day), "server_now": str(server_now)}, "total": self.total}


def _install(stub: _StubSummary, *, floor: float, poll: float) -> None:
    """Replace everything the two stream endpoints touch outside themselves."""
    main._require_lookups = lambda: None
    main.resolve_context = lambda d, s: SimpleNamespace(
        operational_day=DAY, shift="morning", is_current=True, server_now=NOW
    )
    main.resolve_day_context = lambda d: SimpleNamespace(operational_day=DAY, is_current=True, server_now=NOW)
    aggregations.build_summary = stub.summary
    aggregations.build_incident_history = stub.history
    main.UNWATCHED_REBUILD_FLOOR = floor
    main.WATCHED_REBUILD_FLOOR = floor
    main.LIVE_POLL_INTERVAL = poll
    main.HISTORICAL_POLL_INTERVAL = poll


_ORIGINALS = {
    "_require_lookups": main._require_lookups,
    "resolve_context": main.resolve_context,
    "resolve_day_context": main.resolve_day_context,
    "build_summary": aggregations.build_summary,
    "build_incident_history": aggregations.build_incident_history,
    "UNWATCHED_REBUILD_FLOOR": main.UNWATCHED_REBUILD_FLOOR,
    "WATCHED_REBUILD_FLOOR": main.WATCHED_REBUILD_FLOOR,
    "LIVE_POLL_INTERVAL": main.LIVE_POLL_INTERVAL,
    "HISTORICAL_POLL_INTERVAL": main.HISTORICAL_POLL_INTERVAL,
    "db": events.db,
}


def _restore() -> None:
    main._require_lookups = _ORIGINALS["_require_lookups"]
    main.resolve_context = _ORIGINALS["resolve_context"]
    main.resolve_day_context = _ORIGINALS["resolve_day_context"]
    aggregations.build_summary = _ORIGINALS["build_summary"]
    aggregations.build_incident_history = _ORIGINALS["build_incident_history"]
    main.UNWATCHED_REBUILD_FLOOR = _ORIGINALS["UNWATCHED_REBUILD_FLOOR"]
    main.WATCHED_REBUILD_FLOOR = _ORIGINALS["WATCHED_REBUILD_FLOOR"]
    main.LIVE_POLL_INTERVAL = _ORIGINALS["LIVE_POLL_INTERVAL"]
    main.HISTORICAL_POLL_INTERVAL = _ORIGINALS["HISTORICAL_POLL_INTERVAL"]
    events.db = _ORIGINALS["db"]


def _run(coro):
    """Each test drives its own loop - the runner is plain synchronous."""
    try:
        return asyncio.run(coro)
    finally:
        _restore()


async def _frame(gen, timeout=3.0) -> dict:
    """The next *data* frame, skipping the `server` handshake.

    Every stream opens by naming the running deployment (main._sse) so an
    open board can notice it was redeployed under. That frame carries no
    dashboard data, and no test here is about it - see
    test_every_stream_opens_by_naming_the_deployment for the one that is.
    """
    while True:
        event = await asyncio.wait_for(gen.__anext__(), timeout)
        if event.get("event") == "server":
            continue
        return json.loads(event["data"])


async def _abandon(task, gen) -> None:
    """Drop a pull that was never going to complete, then close the stream.

    The cancellation has to be awaited before `aclose`: until the throw has
    actually landed the generator is still executing, and closing it there
    raises "asynchronous generator is already running" - which fails the test
    for a reason that has nothing to do with what it set out to check.
    """
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    await gen.aclose()


# --------------------------------------------------------------------------
# the wake-up bus
# --------------------------------------------------------------------------


def test_notify_reaches_every_connection_not_only_the_one_that_wrote():
    async def scenario():
        a, b = events.subscribe(), events.subscribe()
        events.notify_incidents_changed()
        # B is the whole point: the operator watching a board they did not
        # write to. Waking only A would look correct to whoever saved.
        await asyncio.wait_for(a.get(), 1)
        await asyncio.wait_for(b.get(), 1)

    _run(scenario())


def test_change_stream_carries_another_replicas_write_into_this_process():
    async def scenario():
        _stub_watch(lambda: _FakeChangeStream([{"operationType": "insert"}]))
        queue = events.subscribe()
        events.start_watcher(asyncio.get_running_loop())
        # Nothing in this process called notify_incidents_changed - the write
        # is only visible because the watcher saw it in the database.
        await asyncio.wait_for(queue.get(), 3)
        assert events.watching() is True
        events.stop_watcher()

    _run(scenario())


def test_a_database_without_change_streams_is_not_an_outage():
    async def scenario():
        _stub_watch(PyMongoError("The $changeStream stage is only supported on replica sets"))
        events.start_watcher(asyncio.get_running_loop())
        await asyncio.sleep(0.3)
        # Reported honestly rather than crashed on, so the streams know to
        # fall back to the tighter floor.
        assert events.watching() is False
        events.stop_watcher()

    _run(scenario())


# --------------------------------------------------------------------------
# the streams
# --------------------------------------------------------------------------


def test_every_stream_opens_by_naming_the_deployment():
    """The frontend cannot tell a redeploy from a cold start on its own.

    Both look identical from the client - the SSE connection drops and comes
    back - and on a free tier the second happens all day. So the build id is
    stated outright on connect, and only ever changes when a deploy changes
    it. Unset (the default) sends null, which the client reads as no claim
    rather than as a change.
    """

    async def scenario():
        _install(_StubSummary(), floor=0, poll=0.05)
        response = await main.stream_summary(_FakeRequest(), None, None)
        gen = response.body_iterator
        first = await asyncio.wait_for(gen.__anext__(), 3.0)
        assert first["event"] == "server"
        assert "build" in json.loads(first["data"])
        await gen.aclose()

    _run(scenario())


def test_the_announce_endpoint_refuses_anything_but_the_configured_token():
    """The one endpoint here that is reachable from outside and fans out to
    every connected client, so the two ways it can be wrong are worth
    pinning: unset config must fail loudly rather than accept anything, and a
    wrong token must not be treated as no token.
    """
    from fastapi.testclient import TestClient

    original = main.DEPLOY_TOKEN
    deploys.reset()
    try:
        client = TestClient(main.app)

        main.DEPLOY_TOKEN = None
        assert client.post("/api/deployments", json={"build": "a"}).status_code == 503

        main.DEPLOY_TOKEN = "s3cret"
        assert client.post("/api/deployments", json={"build": "a"}).status_code == 401
        assert (
            client.post("/api/deployments", json={"build": "a"}, headers={"x-deploy-token": "wrong"}).status_code == 401
        )
        assert deploys.current() is None  # nothing announced by a rejected call

        ok = client.post("/api/deployments", json={"build": "a"}, headers={"x-deploy-token": "s3cret"})
        assert ok.status_code == 200
        assert ok.json() == {"ok": True, "build": "a", "announced": True}
        assert deploys.current() == "a"

        # An empty build id is junk, not a deploy.
        assert (
            client.post("/api/deployments", json={"build": ""}, headers={"x-deploy-token": "s3cret"}).status_code == 422
        )
    finally:
        main.DEPLOY_TOKEN = original
        deploys.reset()


def test_a_frontend_deploy_reaches_a_board_that_is_sitting_idle():
    """The point of pushing deploys down the SSE connection at all.

    An idle board is the normal state - a quiet night produces no dashboard
    frames for minutes at a time - so the announcement has to arrive on its
    own rather than behind the next data frame. If this ever regresses, the
    notice silently degrades back to whenever the client next polls, which is
    exactly the delay this was built to remove.
    """

    async def scenario():
        deploys.reset()
        _install(_StubSummary(), floor=0, poll=0.05)
        gen = (await main.stream_summary(_FakeRequest(), None, None)).body_iterator

        assert (await asyncio.wait_for(gen.__anext__(), 3.0))["event"] == "server"
        assert (await _frame(gen))["total"] == 1  # the stream then goes quiet

        assert deploys.announce("deadbeef") is True
        event = await asyncio.wait_for(gen.__anext__(), 3.0)
        assert event["event"] == "deploy"
        assert json.loads(event["data"])["build"] == "deadbeef"

        # The build script retries a POST that timed out waking the backend;
        # the retry must not send every board off to re-check a second time.
        assert deploys.announce("deadbeef") is False

        await gen.aclose()
        deploys.reset()

    _run(scenario())


def test_dashboard_stream_refreshes_with_no_wake_up_at_all():
    """The regression. A wrote on another replica: this process gets no
    notify, no change-stream event, nothing - and the board must still
    move."""

    async def scenario():
        stub = _StubSummary()
        _install(stub, floor=0, poll=0.05)
        assert events.watching() is False

        gen = (await main.stream_summary(_FakeRequest(), None, None)).body_iterator
        assert (await _frame(gen))["total"] == 1

        stub.total = 2  # the other replica's write; deliberately no notify
        assert (await _frame(gen))["total"] == 2

        await gen.aclose()

    _run(scenario())


def test_incident_history_stream_refreshes_with_no_wake_up_at_all():
    async def scenario():
        stub = _StubSummary()
        _install(stub, floor=0, poll=0.05)

        gen = (await main.stream_incident_history(_FakeRequest(), None)).body_iterator
        assert (await _frame(gen))["total"] == 1

        stub.total = 2
        assert (await _frame(gen))["total"] == 2

        await gen.aclose()

    _run(scenario())


def test_a_local_write_still_pushes_immediately():
    """The floor must not have replaced the fast path - a dispatcher saving
    on this replica should not wait it out."""

    async def scenario():
        stub = _StubSummary()
        _install(stub, floor=60, poll=30)  # far too slow to rescue this test

        gen = (await main.stream_summary(_FakeRequest(), None, None)).body_iterator
        assert (await _frame(gen))["total"] == 1

        stub.total = 2
        events.notify_incidents_changed()
        assert (await _frame(gen, timeout=2))["total"] == 2

        await gen.aclose()

    _run(scenario())


def test_an_idle_board_does_not_query_between_floors():
    async def scenario():
        stub = _StubSummary()
        _install(stub, floor=60, poll=0.02)

        gen = (await main.stream_summary(_FakeRequest(), None, None)).body_iterator
        await _frame(gen)
        assert stub.calls == 1

        # Many ticks, no write, no floor reached: the loop should be doing
        # datetime math and nothing else.
        task = asyncio.ensure_future(gen.__anext__())
        await asyncio.sleep(0.5)
        assert stub.calls == 1, f"idle connection queried {stub.calls} times"

        await _abandon(task, gen)

    _run(scenario())


def test_an_unchanged_payload_is_not_re_sent():
    """The floor makes the stream re-query; the signature is what keeps that
    from turning into a frame every time."""

    async def scenario():
        stub = _StubSummary()
        _install(stub, floor=0, poll=0.02)

        gen = (await main.stream_summary(_FakeRequest(), None, None)).body_iterator
        await _frame(gen)

        task = asyncio.ensure_future(gen.__anext__())
        await asyncio.sleep(0.3)
        assert stub.calls > 1, "expected the floor to re-query"
        assert not task.done(), "identical payload was pushed again"

        await _abandon(task, gen)

    _run(scenario())
