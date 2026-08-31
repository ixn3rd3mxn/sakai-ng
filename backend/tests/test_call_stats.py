"""Offline tests for libs.call_stats - no network, no database.

Every upstream fetcher is stubbed. What these protect is the logic that is
easy to break and hard to notice: which 24 hours get queried, what a 404
means, when a cached day may be reused, and which of the three feeds dates the
payload.
"""

from __future__ import annotations

import asyncio
import datetime as dt

from tests import helpers  # noqa: F401  - path/env setup, must precede libs
from libs import call_stats as cs

TZ = cs.BANGKOK_TZ
UTC = dt.timezone.utc


def _stats(**kw):
    return cs.CallStats(**kw)


# ---------------------------------------------------------------- day windows


def test_day_window_matches_the_documented_example():
    # The range NIEMS' own dashboard uses for 2026-08-28, to the second.
    assert cs.day_epoch_window(dt.date(2026, 8, 28)) == (1787850000, 1787936399)


def test_consecutive_days_abut_exactly():
    a = cs.day_epoch_window(dt.date(2026, 8, 28))
    b = cs.day_epoch_window(dt.date(2026, 8, 29))
    assert a[1] + 1 == b[0], "a gap or overlap here loses or double-counts calls"
    assert a[1] - a[0] == 86399


def test_today_is_resolved_on_a_bangkok_clock():
    # 23:30 UTC is already the next morning in Bangkok. Deriving the day from
    # a UTC host would report yesterday for seven hours every night.
    assert cs.bangkok_calendar_day(dt.datetime(2026, 8, 27, 23, 30, tzinfo=UTC)) == dt.date(2026, 8, 28)
    assert cs.bangkok_calendar_day(dt.datetime(2026, 8, 28, 17, 30, tzinfo=UTC)) == dt.date(2026, 8, 29)
    assert cs.bangkok_calendar_day(dt.datetime(2026, 8, 28, 16, 30, tzinfo=UTC)) == dt.date(2026, 8, 28)


def test_seconds_until_midnight_is_zone_derived():
    assert cs.seconds_until_next_bangkok_midnight(dt.datetime(2026, 8, 28, 23, 59, 59, tzinfo=TZ)) == 1.0
    assert cs.seconds_until_next_bangkok_midnight(dt.datetime(2026, 8, 28, 0, 0, 0, tzinfo=TZ)) == 86400.0
    # A UTC instant must be converted, not read as-is.
    assert cs.seconds_until_next_bangkok_midnight(dt.datetime(2026, 8, 28, 17, 30, tzinfo=UTC)) == 23.5 * 3600


# -------------------------------------------------------------------- parsing


def test_parse_stats_shapes():
    assert cs.parse_stats({"data": []}) == cs.CallStats()
    assert cs.parse_stats({}) == cs.CallStats()
    assert cs.parse_stats({"data": None}) == cs.CallStats()


def test_parse_stats_sums_rows_and_ignores_extra_fields():
    row = {"incoming": 38, "answer": 33, "sla": 25, "abandon": 5, "queue_full_abandon": 0,
           "outgoing": 0, "missed_call": 5, "percent_sla": 75.76, "separator": "x"}
    assert cs.parse_stats({"data": [row]}) == _stats(incoming=38, answer=33, sla=25, abandon=5)
    two = {"data": [row, dict(row, incoming=2, answer=1, sla=1, abandon=1, outgoing=7)]}
    assert cs.parse_stats(two) == _stats(incoming=40, answer=34, sla=26, abandon=6, outgoing=7)


def test_parse_stats_ignores_booleans():
    # bool is an int subclass; True must not silently count as 1.
    assert cs.parse_stats({"data": [{"incoming": True}]}) == cs.CallStats()


def test_parse_times_never_sums_averages():
    # Counters add up. Averages and maxima do not - summing two branches'
    # avg_service would invent a number describing neither.
    two_rows = {"data": [{"avg_service": 100}, {"avg_service": 200}]}
    assert cs.parse_times(two_rows).avg_service == 100
    assert cs.parse_times({"data": []}) is None
    assert cs.parse_times({}) is None
    assert cs.parse_times({"data": [{}]}) == cs.CallTimes()


# ----------------------------------------------------------- 404 is not zero


def test_404_means_zero_for_today_but_no_data_for_a_past_day():
    """The single most consequential rule in this module.

    The upstream returns an identical 404 for "no calls yet this morning" and
    "that date is outside our ~110 day retention". Rendering the second as
    zeros would state that the centre handled no calls on a real past date -
    a false claim rather than a gap.
    """
    today = cs.bangkok_calendar_day()
    helpers.stub_call_stats(cs, rollup=None, live=None, times=None)

    payload = asyncio.run(cs.get_call_stats(today))
    assert payload["available"] is True and payload["incoming"] == 0

    # Reset clears the day cache *and* restores the real fetchers, so the
    # stub has to be reinstalled for the second half.
    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(cs, rollup=None, live=None, times=None)
    past = asyncio.run(cs.get_call_stats(today - dt.timedelta(days=3)))
    assert past["available"] is False, "a past day with no rows must not read as zero calls"


# ------------------------------------------------------------------- caching


def test_a_finished_day_is_fetched_once_ever():
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    day = today - dt.timedelta(days=5)
    fetched = []

    def rollup(d):
        fetched.append(d)
        return _stats(incoming=42, answer=40)

    helpers.stub_call_stats(cs, rollup=rollup, live=None, times=None)
    for _ in range(3):
        payload = asyncio.run(cs.get_call_stats(day))
    assert fetched.count(day) == 1, "a completed day cannot change; refetching it is waste"
    assert payload["incoming"] == 42
    assert cs._entries[day].final is True


def test_a_day_captured_mid_day_is_refetched_once_it_ends():
    """The rollover case. Today's entry is partial by definition, so after
    midnight it must be re-read to pick up the closing numbers - the TTL must
    not short-circuit that."""
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    fetched = []

    def rollup(d):
        fetched.append(d)
        return _stats(incoming=10)

    helpers.stub_call_stats(cs, rollup=rollup, live=None, times=None)
    asyncio.run(cs.get_call_stats(today))
    assert cs._entries[today].final is False

    tomorrow = today + dt.timedelta(days=1)
    real_today = cs.bangkok_calendar_day
    cs.bangkok_calendar_day = lambda now=None: tomorrow  # midnight passes
    try:
        fetched.clear()
        payload = asyncio.run(cs.get_call_stats(today))
        assert fetched.count(today) == 1, "partial numbers would otherwise stand as a completed day"
        assert payload["is_current"] is False
        assert cs._entries[today].final is True
        fetched.clear()
        asyncio.run(cs.get_call_stats(today))
        assert fetched == [], "and from then on it is immutable"
    finally:
        cs.bangkok_calendar_day = real_today


def test_browsing_history_never_evicts_today():
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=1), live=None, times=None)
    asyncio.run(cs.get_call_stats(today))
    for n in range(1, cs.MAX_CACHED_DAYS + 20):
        asyncio.run(cs.get_call_stats(today - dt.timedelta(days=n)))
    assert len(cs._entries) <= cs.MAX_CACHED_DAYS
    assert today in cs._entries, "today is the one key read continuously"


# ------------------------------------------------------------- live overlay


def test_overlay_replaces_only_the_live_fields():
    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(
        cs,
        rollup=lambda d: _stats(incoming=10, answer=8, sla=7, abandon=3, queue_full_abandon=2, outgoing=4),
        live=lambda: {"incoming": 93, "answer": 79, "sla": 68},
        times=None,
    )
    p = asyncio.run(cs.get_call_stats())
    assert (p["incoming"], p["answer"], p["sla"]) == (93, 79, 68)
    assert (p["abandon"], p["queue_full_abandon"], p["outgoing"]) == (3, 2, 4)
    assert p["live"] is True


def test_a_partial_overlay_is_refused_wholesale():
    # Merging some fields would mix observation times *within* the overlay, on
    # top of the mismatch it already carries against the rollup's three.
    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=10), live=lambda: {"incoming": 93}, times=None)
    p = asyncio.run(cs.get_call_stats())
    assert (p["incoming"], p["live"]) == (10, False)


def test_overlay_is_discarded_at_the_rollover():
    """The live feed serves only 'today'. A cached overlay carried across
    midnight would paint the finished day's totals onto the new day."""
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=1), live=lambda: {"incoming": 900, "answer": 900, "sla": 900}, times=None)
    assert asyncio.run(cs.get_call_stats())["incoming"] == 900

    tomorrow = today + dt.timedelta(days=1)
    real_today = cs.bangkok_calendar_day
    cs.bangkok_calendar_day = lambda now=None: tomorrow
    try:
        helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=1), live=lambda: None, times=None)
        p = asyncio.run(cs.get_call_stats())
        assert p["incoming"] == 1, "yesterday's live overlay must not survive midnight"
        assert p["live"] is False
    finally:
        cs.bangkok_calendar_day = real_today


def test_live_failure_falls_back_without_counting_backwards():
    # The rollup lags minutes behind, so dropping straight to it would make
    # the counters visibly decrease. The last good overlay covers the gap.
    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=10), live=lambda: {"incoming": 93, "answer": 79, "sla": 68}, times=None)
    assert asyncio.run(cs.get_call_stats())["incoming"] == 93
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=10), live=lambda: None, times=None)
    p = asyncio.run(cs.get_call_stats(force=True))
    assert p["incoming"] == 93, "a transient live blip must not drop the board back to the rollup"


# -------------------------------------------------------------------- diffs


def test_diff_is_null_not_zero_when_there_is_nothing_to_compare():
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=100) if d == today else None, live=None, times=None)
    p = asyncio.run(cs.get_call_stats())
    assert p["diff"] is None, "zeros would claim the previous day matched exactly"
    assert p["available"] is True and p["incoming"] == 100


def test_diffs_are_computed_against_the_previous_day():
    helpers.reset_call_stats(cs)
    today = cs.bangkok_calendar_day()

    def rollup(d):
        return _stats(incoming=100, answer=90) if d == today else _stats(incoming=60, answer=55)

    def times(d):
        if d == today:
            return cs.CallTimes(avg_accept=12, longest_accept=44, avg_service=49, total_service=1171)
        return cs.CallTimes(avg_accept=6, longest_accept=32, avg_service=119, total_service=14768)

    helpers.stub_call_stats(cs, rollup=rollup, live=None, times=times)
    p = asyncio.run(cs.get_call_stats())
    assert p["compare_day"] == (today - dt.timedelta(days=1)).isoformat()
    assert p["diff"]["incoming"] == 40
    assert p["times_diff"] == {"avg_accept": 6, "longest_accept": 12, "avg_service": -70, "total_service": -13597}


def test_durations_blank_independently_of_the_counters():
    """An unreachable durations feed blanks its four cards and leaves the six
    counters alone.

    Stubbed to raise rather than to return None: since None for today came to
    mean "zero so far", an outage has to be signalled by raising, or the cards
    would render 00:00:00 and state that no time was spent on calls when the
    truth is that nothing is known.
    """

    def unreachable(day):
        raise RuntimeError("durations feed down")

    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=10), live=None, times=unreachable)
    p = asyncio.run(cs.get_call_stats())
    assert p["times"] is None and p["times_diff"] is None
    assert p["available"] is True and p["incoming"] == 10


# ------------------------------------------------------------ broadcast loop


def test_one_shared_poller_serves_every_subscriber():
    helpers.reset_call_stats(cs)
    served = {"n": 0}
    fetched = []

    def rollup(d):
        fetched.append(d)
        served["n"] += 1
        return _stats(incoming=served["n"])

    async def scenario():
        helpers.stub_call_stats(cs, rollup=rollup, live=None, times=None)
        cs.POLL_SECONDS = cs.LIVE_POLL_SECONDS = cs.RETRY_SECONDS = 1
        assert cs._poller is None, "nothing polls until someone is watching"
        q1 = await cs.subscribe()
        q2 = await cs.subscribe()
        assert cs._poller is not None and len(cs._subscribers) == 2
        p1 = await asyncio.wait_for(q1.get(), timeout=5)
        p2 = await asyncio.wait_for(q2.get(), timeout=5)
        assert p1 is p2, "one fetch feeds every client"
        cs.unsubscribe(q1)
        assert cs._poller is not None
        cs.unsubscribe(q2)
        await asyncio.sleep(0)
        assert cs._poller is None, "the loop must stop when the last board closes"

    asyncio.run(scenario())


def test_an_unchanged_board_still_receives_a_heartbeat():
    """fetched_at is part of the signature on purpose. Without it a quiet
    stretch sends nothing at all, and a working board looks identical to a
    backend that died an hour ago."""
    helpers.reset_call_stats(cs)

    async def scenario():
        helpers.stub_call_stats(cs, rollup=lambda d: _stats(incoming=9), live=None, times=None)
        cs.POLL_SECONDS = cs.LIVE_POLL_SECONDS = cs.RETRY_SECONDS = 1
        q = await cs.subscribe()
        stamps = [(await asyncio.wait_for(q.get(), timeout=8))["fetched_at"] for _ in range(3)]
        cs.unsubscribe(q)
        assert len(set(stamps)) == 3, "counters never changed, yet each frame is dated afresh"

    asyncio.run(scenario())


def test_a_slow_client_keeps_the_newest_payload():
    helpers.reset_call_stats(cs)

    async def scenario():
        q = asyncio.Queue(maxsize=1)
        q.put_nowait({"incoming": 1})
        if q.full():
            q.get_nowait()
        q.put_nowait({"incoming": 2})
        assert q.get_nowait()["incoming"] == 2, "drop the superseded frame, not the fresh one"

    asyncio.run(scenario())


# ---------------------------------------------------------------------------
# Midnight: the duration cards
# ---------------------------------------------------------------------------


def test_todays_durations_are_zero_not_missing_before_the_first_call():
    """The four duration cards showed a dash from midnight until the first
    call of the day while the six counters beside them showed 0 - which read
    as the durations being broken rather than the day being new.

    The durations feed 404s for an empty range exactly as the counters feed
    does, so it gets the same rule: for today the answer is known and it is
    zero."""
    today = cs.bangkok_calendar_day()
    helpers.stub_call_stats(cs, rollup=None, live=None, times=None)
    payload = asyncio.run(cs.get_call_stats(today))
    assert payload["available"] is True
    assert payload["times"] is not None, "a dash means 'not known'; before the first call it is known"
    assert payload["times"] == {"avg_accept": 0, "longest_accept": 0, "avg_service": 0, "total_service": 0}


def test_a_past_day_outside_retention_keeps_its_dash():
    """The other half of the same 404. Claiming zero average talk time for a
    real past date would be a false statement rather than a gap."""
    long_ago = cs.bangkok_calendar_day() - dt.timedelta(days=400)
    helpers.stub_call_stats(cs, rollup=None, live=None, times=None)
    payload = asyncio.run(cs.get_call_stats(long_ago))
    assert payload["available"] is False
    assert payload["times"] is None


def test_the_comparison_survives_a_day_that_has_not_started():
    """What the card actually renders at 00:00:01: zeros against yesterday's
    real durations, so "xx:xx:xx เทียบกับเมื่อวาน" appears instead of nothing."""
    today = cs.bangkok_calendar_day()
    yesterday = today - dt.timedelta(days=1)

    def times(day):
        return None if day == today else cs.CallTimes(avg_accept=7, longest_accept=44, avg_service=57, total_service=6664)

    helpers.stub_call_stats(cs, rollup=lambda day: cs.CallStats(), live=None, times=times)
    payload = asyncio.run(cs.get_call_stats(today))
    assert payload["times_diff"] == {
        "avg_accept": -7,
        "longest_accept": -44,
        "avg_service": -57,
        "total_service": -6664,
    }


def test_an_outage_is_not_mistaken_for_a_day_that_has_not_started():
    """The distinction the two branches exist for, asserted side by side: on
    the same day, an empty range reads as zero and an unreachable feed reads
    as unknown."""
    today = cs.bangkok_calendar_day()

    def unreachable(day):
        raise RuntimeError("durations feed down")

    helpers.stub_call_stats(cs, rollup=lambda d: cs.CallStats(), live=None, times=unreachable)
    assert asyncio.run(cs.get_call_stats(today))["times"] is None

    helpers.reset_call_stats(cs)
    helpers.stub_call_stats(cs, rollup=lambda d: cs.CallStats(), live=None, times=None)
    assert asyncio.run(cs.get_call_stats(today))["times"] == {
        "avg_accept": 0, "longest_accept": 0, "avg_service": 0, "total_service": 0
    }


# ---------------------------------------------------------------------------
# Hourly buckets (the chart)
# ---------------------------------------------------------------------------


def _hour(pointer, incoming=0, answer=0, missed=0):
    return {"pointer": pointer, "separator": f"{pointer:02d}:00", "incoming": incoming,
            "answer": answer, "missed_call": missed, "abandon": missed, "queue_full_abandon": 0}


def test_hourly_always_yields_24_buckets_in_order():
    """A missing hour would shift every later bar one place left, so gaps are
    filled rather than dropped."""
    body = {"data": [_hour(14, 10, 8, 2), _hour(2, 2, 2, 0)]}
    out = cs.parse_hourly(body)
    assert len(out) == 24
    assert [b["hour"] for b in out] == list(range(24))
    assert out[14]["incoming"] == 10 and out[2]["incoming"] == 2
    assert out[0]["incoming"] == 0, "an hour the upstream omitted is a quiet hour, not a missing category"


def test_hourly_is_keyed_on_pointer_not_row_order():
    """The chart's x-axis is the hour, so it must not depend on the upstream
    happening to return the rows sorted."""
    out = cs.parse_hourly({"data": [_hour(23, 5, 5, 0), _hour(0, 1, 1, 0)]})
    assert out[23]["incoming"] == 5 and out[0]["incoming"] == 1


def test_hourly_labels_are_padded_clock_readings():
    out = cs.parse_hourly({"data": [_hour(9, 1, 1, 0)]})
    assert out[9]["label"] == "09:00" and out[23]["label"] == "23:00"


def test_hourly_stack_sums_to_incoming():
    """What makes the stacked bar honest rather than approximate: the height of
    a column *is* the hour's incoming total, not something close to it."""
    out = cs.parse_hourly({"data": [_hour(14, 10, 8, 2)]})
    assert out[14]["answer"] + out[14]["missed"] == out[14]["incoming"]


def test_an_empty_hourly_response_is_null_not_a_flat_chart():
    """A quiet day answers 200 with 24 rows of zeros; no rows at all is a
    broken response. Zeros here would draw an empty chart claiming to be data."""
    assert cs.parse_hourly({"data": []}) is None
    assert cs.parse_hourly({}) is None


def test_hourly_ignores_rows_with_an_unusable_pointer():
    out = cs.parse_hourly({"data": [_hour(24, 9, 9, 0), {"pointer": True}, _hour(5, 3, 3, 0)]})
    assert out[5]["incoming"] == 3
    assert sum(b["incoming"] for b in out) == 3, "hour 24 does not exist and must not be folded in"
