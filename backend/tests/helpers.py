"""Shared setup for the test suites.

Import this *before* anything from `libs`: it puts `backend/` on the path and
supplies a dummy MONGO_URI, because `libs.configs` reads that at import time
and `libs.agents` imports it transitively. pymongo builds client handles
lazily (no connection until a command is issued), so a URI pointing nowhere is
enough to import the modules under test without a database.
"""

from __future__ import annotations

import os
import sys

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

os.environ.setdefault("MONGO_URI", "mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=200")

# Live tests hit the real NIEMS APIs. They are skipped unless explicitly
# enabled, so a CI run is never hostage to a third party being reachable.
RUN_LIVE = os.environ.get("RUN_LIVE_TESTS") == "1"


class Skip(Exception):
    """Raised to skip a test rather than fail it."""


def requires_live() -> None:
    if not RUN_LIVE:
        raise Skip("set RUN_LIVE_TESTS=1 to run tests that call the real NIEMS APIs")


_ORIGINALS: dict[str, object] = {}


def _remember_originals(module) -> None:
    """Capture the real fetchers once, before anything stubs them."""
    for name in ("_fetch", "_fetch_live", "_fetch_times"):
        _ORIGINALS.setdefault(name, getattr(module, name))


def reset_call_stats(module) -> None:
    """Clear every piece of module-level state in libs.call_stats.

    These modules deliberately cache across calls - per-day entries, the live
    overlay, the broadcast signature. Tests that share that state between them
    pass or fail depending on execution order, which is worse than no tests,
    so each one starts from a clean module.
    """
    module._entries.clear()
    module._live_values = None
    module._live_at = 0.0
    module._live_day = None
    module._live_fetched_at = None
    module._latest = None
    module._latest_signature = None
    module._subscribers.clear()
    module._poller = None
    module._client = None
    module._client_loop = None
    # Restore the real fetchers. Without this the stubs outlive the test that
    # installed them and the next suite runs against them - which is how the
    # live API tests ended up asserting against leftover offline stubs, and
    # why results depended on the order suites happened to run in.
    _remember_originals(module)
    for name, func in _ORIGINALS.items():
        setattr(module, name, func)


def reset_agents(module) -> None:
    module._names = {}
    module._names_at = 0.0
    # The held-over roster, or a grace window left open by an earlier test
    # would let the next one assert against the previous one's data.
    module._last_good = None
    module._last_good_at = 0.0
    module._last_good_fetched_at = None
    module._latest = None
    module._latest_signature = None
    module._subscribers.clear()
    module._poller = None
    module._client = None
    module._client_loop = None


def reset_call_log(module) -> None:
    module._latest = None
    module._latest_signature = None
    module._subscribers.clear()
    module._poller = None
    module._client = None
    module._client_loop = None
    for name, func in _CALL_LOG_ORIGINALS.items():
        setattr(module, name, func)


def reset_all() -> None:
    """Restore both modules to a pristine state.

    Called by the runner before *every* test, so isolation does not depend on
    each test remembering to reset - which is how the live suite ended up
    asserting against stubs the offline suite had left installed.
    """
    from libs import agents as _agents, call_log as _call_log, call_stats as _call_stats

    reset_call_stats(_call_stats)
    reset_agents(_agents)
    reset_call_log(_call_log)


def stub_call_stats(module, *, rollup=None, live=None, times=None) -> None:
    """Replace the three upstream fetchers.

    All three must be stubbed together in any offline test. Leaving one real
    means it silently reaches the network mid-test - which is exactly how the
    live feed and the durations feed each leaked into these suites while they
    were being written, producing assertions that passed against whatever the
    call centre happened to be doing.
    """

    async def _rollup(day):
        return rollup(day) if callable(rollup) else rollup

    async def _live():
        return live() if callable(live) else live

    async def _times(day):
        return times(day) if callable(times) else times

    _remember_originals(module)
    module._fetch = _rollup
    module._fetch_live = _live
    module._fetch_times = _times


_CALL_LOG_ORIGINALS: dict[str, object] = {}


def stub_call_log(module, *, abandoned=None, calls=None) -> None:
    """Replace both of libs.call_log's fetchers.

    Both together, never one: the two feeds are gathered concurrently, so
    leaving either real means it reaches the network mid-test and the
    assertion is made against whatever the call centre is doing right now.
    Passing None for one models that feed being unreachable, which is the
    case the independent availability flags exist for.
    """
    for name in ("_fetch_abandoned", "_fetch_call_logs"):
        _CALL_LOG_ORIGINALS.setdefault(name, getattr(module, name))

    async def _abandoned():
        return abandoned() if callable(abandoned) else abandoned

    async def _calls(day, names):
        return calls(day, names) if callable(calls) else calls

    module._fetch_abandoned = _abandoned
    module._fetch_call_logs = _calls


class FakeResponse:
    """Enough of httpx.Response for the fetchers: a status, a body, and a
    raise_for_status that behaves like the real one."""

    def __init__(self, status_code: int, body: dict | None = None):
        self.status_code = status_code
        self._body = body if body is not None else {}

    def json(self) -> dict:
        return self._body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def stub_call_log_http(module, response: FakeResponse) -> None:
    """Replace the shared client so a specific HTTP status can be exercised.

    Registered in _CALL_LOG_ORIGINALS so reset_call_log puts the real `_http`
    back before the next test - without that the fake client outlives the test
    that installed it and the live suite starts asserting against it, which is
    the failure mode that made these suites order-dependent once already.
    """
    _CALL_LOG_ORIGINALS.setdefault("_http", module._http)

    class _Client:
        # **kwargs because the fetchers go through libs.relay.get, which
        # always passes params= and headers= - headers being None when no
        # relay is configured. A narrower signature would make every test
        # using this stub fail on an unexpected keyword rather than on
        # whatever it set out to check.
        async def get(self, url, params=None, **kwargs):
            return response

    module._http = lambda: _Client()
