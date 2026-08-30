"""Contract tests against the real NIEMS APIs.

Skipped unless RUN_LIVE_TESTS=1, so an ordinary run never depends on a third
party being reachable. Run these when something looks wrong on the board, or
after NIEMS announce a change - they assert the shape and semantics the rest
of the code is built on, not specific values, which move constantly.
"""

from __future__ import annotations

import asyncio
import datetime as dt

from tests import helpers
from tests.helpers import requires_live
from libs import agents, call_stats as cs


def test_rollup_feed_answers_for_today():
    requires_live()
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    stats = asyncio.run(cs._fetch(today))
    assert stats is not None, "the rollup should have rows for today"
    assert stats.incoming >= stats.answer, "answered cannot exceed incoming"


def test_a_day_outside_retention_returns_no_rows():
    """The upstream keeps roughly 110 days and 404s beyond that - the same 404
    it gives for a day with no calls yet, which is why the caller and not the
    fetcher decides what it means."""
    requires_live()
    long_ago = cs.bangkok_calendar_day() - dt.timedelta(days=365)
    assert asyncio.run(cs._fetch(long_ago)) is None


def test_the_range_parameters_ignore_time_of_day():
    """Why like-for-like comparison is impossible.

    A one-hour window returns the same totals as the whole day, so "yesterday
    up to this hour" cannot be asked for. If this ever starts failing, the
    day-over-day diff can be made a true period-to-date comparison.
    """
    requires_live()
    import httpx

    yesterday = cs.bangkok_calendar_day() - dt.timedelta(days=1)
    start, end = cs.day_epoch_window(yesterday)
    params = {"branch_id": cs.BRANCH_ID, "org_code": cs.ORG_CODE}
    with httpx.Client(timeout=20) as client:
        full = client.get(cs.BASE_URL, params={**params, "from": start, "until": end}).json()
        hour = client.get(cs.BASE_URL, params={**params, "from": start, "until": start + 3600}).json()
    assert cs.parse_stats(full) == cs.parse_stats(hour), "sub-day ranges are apparently honoured now"


def test_durations_feed_shape():
    requires_live()
    helpers.reset_call_stats(cs)
    times = asyncio.run(cs._fetch_times(cs.bangkok_calendar_day()))
    assert times is not None
    # Every value is seconds; the widget formats them as HH:MM:SS.
    assert times.longest_accept >= times.avg_accept >= 0
    assert times.total_service >= times.avg_service >= 0


def test_live_feed_supplies_every_overlay_field():
    """The overlay is all-or-nothing, so a field disappearing upstream would
    silently drop the board back to the lagging rollup."""
    requires_live()
    values = asyncio.run(cs._fetch_live())
    assert values is not None
    for field in cs.LIVE_FIELDS:
        assert field in values, f"live feed no longer publishes {field}"


def test_live_feed_still_lacks_queue_full_abandon():
    """The reason three counters stay on the rollup. If this starts failing,
    all six could come from one source and the board would reconcile."""
    requires_live()
    import httpx

    with httpx.Client(timeout=20) as client:
        body = client.get(cs.LIVE_URL.format(branch=cs.BRANCH_ID)).json()
    assert "queue_full_abandon" not in body["data"]["summary"]


def test_agent_feed_yields_one_row_per_extension():
    """The type-1/type-5 filter is the entire de-duplication. If the upstream
    changed its queue structure this would start returning duplicates."""
    requires_live()
    import httpx

    with httpx.Client(timeout=20) as client:
        body = client.get(agents.AGENTS_URL.format(branch=agents.BRANCH_ID)).json()
    kept = [r for r in body["data"] if r.get("agent_type_id") in agents.ROLES]
    extensions = [r["agent_extension"] for r in kept]
    assert len(extensions) == len(set(extensions)), "the type filter no longer de-duplicates"


def test_agent_feed_actions_are_all_recognised():
    """Not a failure if it trips - unknown statuses render safely - but it is
    how you find out NIEMS added one, which is worth a label of its own."""
    requires_live()
    import httpx

    with httpx.Client(timeout=20) as client:
        body = client.get(agents.AGENTS_URL.format(branch=agents.BRANCH_ID)).json()
    seen = {r.get("action") for r in body["data"] if r.get("agent_type_id") in agents.ROLES}
    known = set(agents.STATUSES) | agents.HIDDEN_ACTIONS
    assert seen <= known, f"unmapped agent action(s): {sorted(seen - known)}"
