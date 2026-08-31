"""Contract tests against the real NIEMS APIs.

Skipped unless RUN_LIVE_TESTS=1, so an ordinary run never depends on a third
party being reachable. Run these when something looks wrong on the board, or
after NIEMS announce a change - they assert the shape and semantics the rest
of the code is built on, not specific values, which move constantly.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json

from tests import helpers
from tests.helpers import requires_live
from libs import agents, call_log as cl, call_stats as cs


def _a_day_with_traffic():
    """Today if it has started, otherwise yesterday.

    These assert the shape and semantics of the feeds, so they need a day with
    rows in it. Today is empty for the first hours of every day - which is a
    correct state, not a fault - and pinning them to today made all four fail
    overnight. Yesterday is complete and comfortably inside retention.
    """
    today = cs.bangkok_calendar_day()
    return today if asyncio.run(cs._fetch(today)) is not None else today - dt.timedelta(days=1)


def test_rollup_feed_answers_for_a_day_with_traffic():
    requires_live()
    helpers.reset_call_stats(cs)
    stats = asyncio.run(cs._fetch(_a_day_with_traffic()))
    assert stats is not None, "the rollup should have rows for a day that has traffic"
    assert stats.incoming >= stats.answer, "answered cannot exceed incoming"


def test_an_empty_today_reads_as_zero_not_as_missing():
    """The midnight contract, asserted against the real feed: before the first
    call the rollup and the durations feed both 404, and both must surface as
    zeros for today rather than as a dash."""
    requires_live()
    helpers.reset_call_stats(cs)
    payload = asyncio.run(cs.get_call_stats(cs.bangkok_calendar_day()))
    assert payload["available"] is True
    assert payload["times"] is not None, "today's durations are known even when the day is young"


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
    times = asyncio.run(cs._fetch_times(_a_day_with_traffic()))
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


# ---------------------------------------------------------------------------
# libs.call_log - the two per-call feeds
# ---------------------------------------------------------------------------


def test_abandoned_feed_is_grouped_by_caller_not_by_call():
    """The distinction the missed-calls table depends on: a row is a *number*,
    carrying how many times it gave up today, so the row count is a floor on
    the number of abandoned calls and not the count itself."""
    requires_live()
    rows = asyncio.run(cl._fetch_abandoned())
    assert rows is not None, "the abandoned feed should answer for today"
    assert all(r["attempts"] >= 1 for r in rows)
    assert len({r["phone"] for r in rows if r["phone"]}) == len([r for r in rows if r["phone"]]), \
        "one row per number - if this fails the feed has started returning per-call rows"


def test_call_log_feed_carries_answered_and_abandoned_actions():
    """If ABANDON ever stops appearing, the exclusion in parse_call_logs is
    dead code and the reason for it should be re-checked rather than assumed."""
    requires_live()
    start, end = cs.day_epoch_window(_a_day_with_traffic())
    import httpx

    body = httpx.get(cl.CALL_LOGS_URL, params={
        "page": 1, "per_page": cl.PER_PAGE, "branch_id": cl.BRANCH_ID,
        "start_date": start, "end_date": end,
    }, timeout=cl.TIMEOUT_SECONDS).json()
    actions = {r.get("action") for r in body.get("data") or []}
    assert "HANGUP" in actions, "a day with no answered calls means something else is wrong"

    # This caught QUEUE_FULL_ABANDON on its first appearance, a day after the
    # deny-list was written from a sample that did not contain it - ten rows
    # were being drawn as answered calls. Any further new action gets the same
    # treatment: look at it and decide, rather than let it default to answered.
    unknown = actions - {"HANGUP"} - set(cl.UNANSWERED_ACTIONS)
    assert not unknown, f"undocumented action(s) {unknown} - decide whether they are answered calls"

    # The structural guard behind the deny-list: whatever the action is called,
    # a row that never reached a desk must not reach the table.
    for row in body.get("data") or []:
        if row.get("action") in cl.UNANSWERED_ACTIONS:
            continue
        assert cl.reached_an_agent(str(row.get("destination") or "")),             f"action {row.get('action')!r} has destination {row.get('destination')!r}, which is not an agent extension"


def test_call_log_feed_fits_in_one_page():
    """PER_PAGE is set well above a normal day; pagination is honoured anyway,
    but if this starts failing the constant is the thing to raise."""
    requires_live()
    start, end = cs.day_epoch_window(_a_day_with_traffic())
    import httpx

    meta = httpx.get(cl.CALL_LOGS_URL, params={
        "page": 1, "per_page": cl.PER_PAGE, "branch_id": cl.BRANCH_ID,
        "start_date": start, "end_date": end,
    }, timeout=cl.TIMEOUT_SECONDS).json()["_metadata"]
    assert meta["page_count"] <= cl.MAX_PAGES


def test_no_national_id_reaches_the_call_log_payload():
    """agent_username is a Thai national ID. This asserts against the real
    feed, not a fixture, because the field is the upstream's to change."""
    requires_live()
    payload = asyncio.run(cl.get_call_log())
    blob = json.dumps(payload, ensure_ascii=False)
    assert "agent_username" not in blob


def test_hourly_feed_stacks_exactly():
    """The chart stacks answered + missed and reads the total off the bar
    height. That is only honest while incoming is exactly their sum - if this
    ever fails, the chart is misreporting and needs incoming drawn separately."""
    requires_live()
    helpers.reset_call_stats(cs)
    buckets = asyncio.run(cs._fetch_hourly(_a_day_with_traffic()))
    assert buckets is not None and len(buckets) == 24
    off = [b for b in buckets if b["answer"] + b["missed"] != b["incoming"]]
    assert not off, f"incoming is not answer+missed in hour(s) {[b['hour'] for b in off]}"


def test_hourly_totals_agree_with_the_daily_counters():
    """The chart and the cards above it describe the same day, so a reader
    adding up the bars must land on the number on the card."""
    requires_live()
    helpers.reset_call_stats(cs)
    day = _a_day_with_traffic()
    buckets = asyncio.run(cs._fetch_hourly(day))
    helpers.reset_call_stats(cs)
    stats = asyncio.run(cs._fetch(day))
    assert sum(b["incoming"] for b in buckets) == stats.incoming
    assert sum(b["answer"] for b in buckets) == stats.answer


def test_hourly_feed_answers_200_for_a_day_that_has_not_started():
    """Unlike the rollup and the durations feed, this one does not 404 on an
    empty range - which is why _fetch_hourly needs no today-versus-past rule."""
    requires_live()
    buckets = asyncio.run(cs._fetch_hourly(cs.bangkok_calendar_day()))
    assert buckets is not None and len(buckets) == 24
