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
    module._latest = None
    module._latest_signature = None
    module._subscribers.clear()
    module._poller = None
    module._client = None
    module._client_loop = None


def reset_all() -> None:
    """Restore both modules to a pristine state.

    Called by the runner before *every* test, so isolation does not depend on
    each test remembering to reset - which is how the live suite ended up
    asserting against stubs the offline suite had left installed.
    """
    from libs import agents as _agents, call_stats as _call_stats

    reset_call_stats(_call_stats)
    reset_agents(_agents)


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
