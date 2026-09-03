"""The invariant checks in libs.feed_health.

These are written against the incident in that module's docstring rather than
against the code: each one states a situation the old, still-running hosts
actually produced on the morning of the migration, and asserts that it is
now noticed. A check that passes here but would not have fired that morning
is not worth having.

The mirror image matters just as much and gets equal space. Every check is
paired with the healthy case it must stay quiet for - a quiet night, the
documented shortfall between the two counter sources, an empty roster - since
a monitor that fires on normal operation gets muted, and a muted monitor
leaves exactly the hole it was added to close.
"""

from __future__ import annotations

import asyncio
import logging
import time as time_module

from tests.helpers import requires_live

from libs import agents, feed_health as fh


def _healthy_agent_feed() -> None:
    """A roster that is being maintained: rows, with a recent action."""
    fh.report_agents(raw_rows=7, parsed_rows=4, newest_action_at=int(time_module.time()) - 600)


def _codes() -> set[str]:
    return {issue["code"] for issue in fh.snapshot()["issues"]}


# ---------------------------------------------------------------------------
# The agent roster: is it being written to, or merely readable?
# ---------------------------------------------------------------------------


def test_a_dead_mirror_is_caught_by_its_timestamps():
    """The exact shape the retired host served: 17 well-formed rows, every
    `action_at` at the epoch. Status codes, schema and row count all look
    healthy - the timestamp is the only thing that gives it away."""
    fh.reset()
    fh.report_agents(raw_rows=17, parsed_rows=4, newest_action_at=0)

    assert "agent_timestamps_impossible" in _codes()
    health = fh.for_feed(fh.AGENTS)
    assert health["ok"] is False
    # Not merely suspect: the statuses on those cards are not readings at all.
    assert health["trusted"] is False


def test_a_live_roster_is_healthy():
    fh.reset()
    _healthy_agent_feed()

    assert fh.snapshot()["ok"] is True
    assert fh.for_feed(fh.AGENTS) == {"ok": True, "trusted": True, "issues": []}


def test_an_empty_roster_is_not_an_error():
    """Nobody signed in is a real answer, not a broken feed. libs.agents
    already separates empty from unreadable; this must not second-guess it."""
    fh.reset()
    fh.report_agents(raw_rows=0, parsed_rows=0, newest_action_at=0)

    assert fh.snapshot()["ok"] is True


def test_a_frozen_roster_warns_but_does_not_discredit():
    """Plausible timestamps that have stopped advancing. Unlike the epoch
    case these are real readings, so the board keeps showing the roster - a
    roster some hours old still answers "who is on duty" better than a blank
    panel does."""
    fh.reset()
    fh.report_agents(raw_rows=7, parsed_rows=4, newest_action_at=int(time_module.time()) - 7 * 3600)

    assert "agent_feed_frozen" in _codes()
    assert fh.for_feed(fh.AGENTS)["trusted"] is True


def test_a_quiet_night_does_not_look_frozen():
    """Two hours without a status change on a 24-hour line is a quiet shift,
    not a fault. The threshold exists to stay clear of exactly this."""
    fh.reset()
    fh.report_agents(raw_rows=7, parsed_rows=4, newest_action_at=int(time_module.time()) - 2 * 3600)

    assert fh.snapshot()["ok"] is True


# ---------------------------------------------------------------------------
# The cross-feed contradiction - the check that would have caught the move
# ---------------------------------------------------------------------------


def test_zero_counters_contradicted_by_the_call_log():
    """The morning of the migration, reproduced: the summary feed reported no
    calls at all while the call log listed thirty of them for the same day.
    Two endpoints, one day, incompatible answers."""
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=0, answer=0, abandon=0)
    fh.report_call_log(day="2026-09-03", calls_available=True, calls=30, missed=4)

    assert "counters_contradicted_by_call_log" in _codes()
    # Both payloads carry it: on the evidence alone either endpoint could be
    # the one lying, so neither gets to present itself as fine.
    assert fh.for_feed(fh.CALL_STATS)["trusted"] is False
    assert fh.for_feed(fh.CALL_LOG)["trusted"] is False


def test_a_genuinely_quiet_day_is_not_a_contradiction():
    """00:30 on a slow night: no calls counted, no calls logged. The two agree,
    and agreement at zero is the normal state for hours every night - firing
    here is what would get the whole thing switched off."""
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=0, answer=0, abandon=0)
    fh.report_call_log(day="2026-09-03", calls_available=True, calls=0, missed=0)

    assert fh.snapshot()["ok"] is True


def test_a_contradiction_needs_both_feeds_to_be_readable():
    """An unreadable call log is not evidence about the counters. Without this
    the ordinary "one feed is down" case would be reported as the far more
    alarming "the feeds disagree"."""
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=0, answer=0, abandon=0)
    fh.report_call_log(day="2026-09-03", calls_available=False, calls=0, missed=0)

    assert fh.snapshot()["ok"] is True


def test_the_two_feeds_are_never_compared_across_a_day_boundary():
    """The loops tick at different rates - 5s and 20s - so around Bangkok
    midnight they sit briefly on either side of the rollover. Comparing then
    would invent a contradiction once every 24 hours."""
    fh.reset()
    fh.report_call_stats(day="2026-09-04", available=True, incoming=0, answer=0, abandon=0)
    fh.report_call_log(day="2026-09-03", calls_available=True, calls=180, missed=12)

    assert fh.snapshot()["ok"] is True


# ---------------------------------------------------------------------------
# Counter arithmetic
# ---------------------------------------------------------------------------


def test_counters_that_exceed_incoming_are_flagged():
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=30, answer=40, abandon=8)

    assert "counters_exceed_incoming" in _codes()


def test_the_documented_shortfall_is_not_flagged():
    """libs.call_stats overlays a live incoming/answer onto a rollup abandon,
    and says in writing that answer + abandon can fall short of incoming
    because the two are read moments apart. That gap is the design, not a
    fault, and it is present on the board most of the day."""
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=93, answer=79, abandon=11)

    assert fh.snapshot()["ok"] is True


def test_negative_counters_discredit_the_numbers():
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=True, incoming=30, answer=-1, abandon=0)

    assert "counters_negative" in _codes()
    assert fh.for_feed(fh.CALL_STATS)["trusted"] is False


def test_an_unavailable_day_is_not_checked_for_arithmetic():
    """The counters are zeros standing in for "nothing known". Checking them
    would report the absence of data as impossible data."""
    fh.reset()
    fh.report_call_stats(day="2026-09-03", available=False, incoming=0, answer=0, abandon=0)

    assert fh.snapshot()["ok"] is True


# ---------------------------------------------------------------------------
# Source divergence
# ---------------------------------------------------------------------------


def test_a_rollup_ahead_of_the_live_feed_is_backwards():
    """The rollup lags by five to ten minutes and the live feed aggregates per
    request, so the rollup cannot legitimately be ahead. When it is, the feed
    that is meant to be fresher has stopped moving."""
    fh.reset()
    fh.report_call_stats(
        day="2026-09-03", available=True, incoming=41, answer=34, abandon=7,
        rollup_incoming=41, live_incoming=0,
    )

    assert "live_feed_behind_rollup" in _codes()


def test_the_live_feed_running_ahead_is_normal():
    """The expected direction: calls that landed inside the rollup's lag."""
    fh.reset()
    fh.report_call_stats(
        day="2026-09-03", available=True, incoming=41, answer=34, abandon=7,
        rollup_incoming=36, live_incoming=41,
    )

    assert fh.snapshot()["ok"] is True


def test_hourly_buckets_must_add_up_to_the_daily_total():
    """Two rollups over the same calls, from two endpoints. One refreshing
    while the other sticks is a plain arithmetic disagreement."""
    fh.reset()
    fh.report_call_stats(
        day="2026-09-03", available=True, incoming=41, answer=34, abandon=7,
        rollup_incoming=41, hourly_incoming=0,
    )

    assert "hourly_disagrees_with_daily" in _codes()
    # One of the two is wrong and the evidence does not say which, so the
    # board keeps showing the daily figure rather than blanking a number that
    # may well be the correct one.
    assert fh.for_feed(fh.CALL_STATS)["trusted"] is True


def test_agreeing_rollups_are_quiet():
    fh.reset()
    fh.report_call_stats(
        day="2026-09-03", available=True, incoming=50, answer=42, abandon=8,
        rollup_incoming=50, hourly_incoming=50,
    )

    assert fh.snapshot()["ok"] is True


def test_the_live_overlay_is_not_mistaken_for_a_rollup_disagreement():
    """The board's `incoming` carries the live overlay; the hourly feed knows
    nothing about it. Comparing the two would report the overlay doing its job
    as a fault every time a call landed inside the rollup's lag - which is
    most of the day."""
    fh.reset()
    fh.report_call_stats(
        day="2026-09-03", available=True, incoming=41, answer=34, abandon=7,
        rollup_incoming=36, live_incoming=41, hourly_incoming=36,
    )

    assert fh.snapshot()["ok"] is True


# ---------------------------------------------------------------------------
# Lifecycle: clearing, expiry, and not flooding the log
# ---------------------------------------------------------------------------


def test_an_issue_clears_when_the_feed_recovers():
    fh.reset()
    fh.report_agents(raw_rows=17, parsed_rows=4, newest_action_at=0)
    assert fh.snapshot()["ok"] is False

    _healthy_agent_feed()
    assert fh.snapshot()["ok"] is True
    assert fh.for_feed(fh.AGENTS)["issues"] == []


def test_a_stale_observation_stops_driving_the_verdict():
    """The poll loops only run while a board is open, so a closed tab means a
    feed simply stops reporting. Without expiry, whatever it last said would
    keep standing as a live verdict for the life of the process."""
    fh.reset()
    fh.report_agents(raw_rows=17, parsed_rows=4, newest_action_at=0)
    assert fh.snapshot()["ok"] is False

    # Age the observation past its TTL, then let any report re-derive.
    fh._observations[fh.AGENTS]["at"] -= fh.OBSERVATION_TTL_SECONDS + 1
    fh.report_call_log(day="2026-09-03", calls_available=True, calls=1, missed=0)

    assert fh.snapshot()["ok"] is True


def test_a_standing_issue_is_logged_once_not_every_poll():
    """The agent feed reports every two seconds. Re-logging an unchanged
    verdict would put 1,800 identical lines an hour into the drain, which is
    how the one message worth reading gets filtered out."""
    fh.reset()
    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = _Capture()
    logger = logging.getLogger("libs.feed_health")
    logger.addHandler(handler)
    previous = logger.level
    logger.setLevel(logging.INFO)
    try:
        for _ in range(5):
            fh.report_agents(raw_rows=17, parsed_rows=4, newest_action_at=0)
        assert len([r for r in records if r.levelno == logging.ERROR]) == 1

        _healthy_agent_feed()
        recovered = [r for r in records if r.levelno == logging.INFO]
        assert len(recovered) == 1
        assert "recovered" in recovered[0].getMessage()
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)


# ---------------------------------------------------------------------------
# The reader that feeds the checks
# ---------------------------------------------------------------------------


def test_newest_action_at_ignores_rows_that_carry_no_timestamp():
    rows = [
        {"agent_extension": "94001"},
        {"agent_extension": "94002", "action_at": 1788401056},
        {"agent_extension": "94003", "action_at": 1788400796},
        "not a dict",
        {"agent_extension": "94004", "action_at": True},  # bool is not a reading
    ]
    assert agents.newest_action_at(rows) == 1788401056


def test_newest_action_at_of_a_dead_feed_is_zero():
    """Every row present, every timestamp at the epoch - the retired host."""
    assert agents.newest_action_at([{"action_at": 0}, {"action_at": 0}]) == 0


# ---------------------------------------------------------------------------
# Against the real feeds
# ---------------------------------------------------------------------------


def test_the_configured_feeds_are_currently_healthy():
    """The whole point, end to end: fetch all three upstreams as the board
    does and assert nothing trips. If this fails, either an upstream has begun
    misbehaving or a check above is too tight to live with - and both are
    worth knowing before the board is trusted for another shift."""
    requires_live()
    fh.reset()
    from libs import call_log, call_stats

    async def run() -> dict:
        try:
            await agents.get_agents()
            await call_stats.get_call_stats()
            await call_log.get_call_log()
            return fh.snapshot()
        finally:
            await call_stats.aclose()
            await agents.aclose()
            await call_log.aclose()

    snapshot = asyncio.run(run())
    assert snapshot["ok"] is True, f"upstream feeds are unhealthy: {snapshot['issues']}"


def test_every_payload_carries_a_health_block():
    """The board can only render a warning it is sent, so the contract that
    each payload carries one is asserted rather than assumed."""
    requires_live()
    from libs import call_log, call_stats

    async def run() -> list[dict]:
        try:
            return [
                await agents.get_agents(),
                await call_stats.get_call_stats(),
                await call_log.get_call_log(),
            ]
        finally:
            await call_stats.aclose()
            await agents.aclose()
            await call_log.aclose()

    for payload in asyncio.run(run()):
        assert "health" in payload
        assert set(payload["health"]) == {"ok", "trusted", "issues"}
