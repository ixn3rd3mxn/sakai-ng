"""Offline tests for libs.call_log - no network, no database.

Both parsers are pure, so most of this needs no stubbing. What it guards is
the filtering and the field choices, each of which was a decision made against
observed data rather than documentation: which rows are not answered calls,
which field actually holds the caller, and what must never reach the payload.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json

from tests import helpers  # noqa: F401  - path/env setup, must precede libs
from libs import call_log


def _log_row(**over):
    row = {
        "a_number": "0937859300",
        "source": "0937859300",
        "destination": "94009",
        "agent_username": "1949900128265",
        "call_begin_at": 1788094346,
        "call_end_at": 1788094362,
        "action": "HANGUP",
        "bound_type": "inbound",
    }
    row.update(over)
    return row


def _abandon_row(**over):
    row = {"lastest_at": 1788074942, "source": "0984972336", "amount": 2, "is_anonymous": False}
    row.update(over)
    return row


# ---------------------------------------------------------------------------
# The answered-call table
# ---------------------------------------------------------------------------


def test_an_unanswered_call_is_labelled_not_hidden():
    """These rows used to be dropped.

    An ABANDON row carries a real agent extension and a one-second duration, so
    shown unlabelled it read as an agent hanging up on somebody - which is why
    it was excluded. A status column removes the ambiguity at the source: the
    row can now say what it is, so it no longer has to be hidden to avoid
    lying.
    """
    body = {"data": [_log_row(action="ABANDON"), _log_row(destination="94017")]}
    out = call_log.parse_call_logs(body, {})
    assert [r["status"] for r in out] == ["abandoned", "answered"]
    assert all(r["extension"] for r in out), "both reached a desk, so both name one"


def test_every_documented_outcome_maps_to_a_status():
    body = {"data": [
        _log_row(action="HANGUP"),
        _log_row(action="ABANDON"),
        _log_row(action="NO_ANSWER"),
        _log_row(action="QUEUE_FULL_ABANDON", destination="942"),
    ]}
    assert [r["status"] for r in call_log.parse_call_logs(body, {})] == [
        "answered", "abandoned", "no_answer", "queue_full"
    ]


def test_an_unknown_action_is_kept_not_dropped():
    """The RINGING lesson from libs.agents: an unfamiliar outcome showing up in
    the table is easier to notice and ask about than a call that silently never
    appears."""
    body = {"data": [_log_row(action="TRANSFER")]}
    out = call_log.parse_call_logs(body, {})
    assert len(out) == 1, "an answered call must not vanish over an unmapped action"


def test_the_caller_comes_from_a_number_not_source():
    """On a sampled day three rows carried an agent extension in `source` - an
    internal transfer - while `a_number` held the outside number throughout."""
    body = {"data": [_log_row(a_number="0935863747", source="94016")]}
    assert call_log.parse_call_logs(body, {})[0]["phone"] == "0935863747"


def test_the_national_id_never_reaches_the_payload():
    """`agent_username` is a Thai national ID. It must not appear anywhere in
    what we serve or store - the agent is identified by extension instead."""
    body = {"data": [_log_row(agent_username="1949900128265")]}
    blob = json.dumps(call_log.parse_call_logs(body, {}), ensure_ascii=False)
    assert "1949900128265" not in blob
    assert "agent_username" not in blob


def test_a_missing_name_falls_back_to_the_extension():
    body = {"data": [_log_row(destination="94009"), _log_row(destination="94099")]}
    out = {r["extension"]: r["agent"] for r in call_log.parse_call_logs(body, {"94009": "จริณ"})}
    assert out["94009"] == "จริณ"
    assert out["94099"] is None, "an unmapped desk keeps its row; the widget shows the extension"


def test_rows_without_both_timestamps_are_skipped():
    body = {"data": [_log_row(call_end_at=None), _log_row(call_begin_at=0), _log_row()]}
    assert len(call_log.parse_call_logs(body, {})) == 1


def test_duration_is_clamped_at_zero():
    """A sampled day contained a row whose end equalled its begin; a negative
    value would format as a nonsense clock reading."""
    body = {"data": [_log_row(call_begin_at=1788094362, call_end_at=1788094346)]}
    assert call_log.parse_call_logs(body, {})[0]["duration"] == 0


def test_answered_calls_are_sorted_newest_first():
    body = {"data": [
        _log_row(call_begin_at=1788094000, call_end_at=1788094100, destination="94001"),
        _log_row(call_begin_at=1788099000, call_end_at=1788099100, destination="94002"),
        _log_row(call_begin_at=1788091000, call_end_at=1788091100, destination="94003"),
    ]}
    assert [r["extension"] for r in call_log.parse_call_logs(body, {})] == ["94002", "94001", "94003"]


# ---------------------------------------------------------------------------
# The abandoned-caller table
# ---------------------------------------------------------------------------


def test_abandoned_rows_are_sorted_newest_first():
    """The feed arrives in no useful order - verified against live data."""
    body = {"data": [
        _abandon_row(lastest_at=1788074942, source="0000000002"),
        _abandon_row(lastest_at=1788086157, source="0000000001"),
        _abandon_row(lastest_at=1788071268, source="0000000003"),
    ]}
    out = call_log.parse_abandoned(body)
    assert [r["phone"] for r in out] == ["0000000001", "0000000002", "0000000003"]


def test_an_anonymous_caller_has_no_number():
    body = {"data": [_abandon_row(is_anonymous=True, source="")]}
    row = call_log.parse_abandoned(body)[0]
    assert row["phone"] is None and row["anonymous"] is True


def test_attempts_are_carried_so_a_repeat_caller_is_visible():
    """The upstream groups by caller, not by call, so a row is a *number*.
    Without `amount`, somebody who tried six times and never got through looks
    identical to somebody who tried once."""
    body = {"data": [_abandon_row(amount=6)]}
    assert call_log.parse_abandoned(body)[0]["attempts"] == 6
    assert call_log.parse_abandoned({"data": [_abandon_row(amount=None)]})[0]["attempts"] == 1


def test_rows_without_a_timestamp_are_skipped():
    assert call_log.parse_abandoned({"data": [_abandon_row(lastest_at=None), _abandon_row()]}) != []
    assert len(call_log.parse_abandoned({"data": [_abandon_row(lastest_at=None)]})) == 0


# ---------------------------------------------------------------------------
# Time and payload shape
# ---------------------------------------------------------------------------


def test_clock_readings_are_bangkok_regardless_of_host_timezone():
    """FastAPI Cloud runs UTC. Formatting on the host clock would print every
    time on the board seven hours early."""
    # 1788094346 is 2026-08-30 19:52:26 +07:00.
    assert call_log._clock(1788094346) == "19:52:26"


def test_one_feed_failing_does_not_blank_the_other():
    """The two feeds are gathered concurrently and fail independently - the
    abandoned feed is ~70x slower, so one timing out while the other answers
    is a normal state, not an edge case."""
    helpers.stub_call_log(call_log, abandoned=None, calls=[{"extension": "94009"}])
    payload = asyncio.run(call_log.get_call_log(dt.date(2026, 8, 30)))
    assert payload["missed_available"] is False and payload["missed"] == []
    assert payload["calls_available"] is True and len(payload["calls"]) == 1
    assert payload["fetched_at"] is not None, "one readable feed still stamps the payload"


def test_both_feeds_failing_leaves_no_timestamp():
    """An empty list means 'none today'; an unreadable feed means nothing is
    known. `fetched_at` is what tells the two apart."""
    helpers.stub_call_log(call_log, abandoned=None, calls=None)
    payload = asyncio.run(call_log.get_call_log(dt.date(2026, 8, 30)))
    assert payload["missed_available"] is False and payload["calls_available"] is False
    assert payload["fetched_at"] is None


def test_the_broadcast_signature_changes_when_a_call_lands():
    helpers.stub_call_log(call_log, abandoned=[], calls=[])
    first = asyncio.run(call_log.get_call_log(dt.date(2026, 8, 30)))
    helpers.stub_call_log(call_log, abandoned=[], calls=[{"extension": "94009"}])
    second = asyncio.run(call_log.get_call_log(dt.date(2026, 8, 30)))
    assert call_log._signature(first) != call_log._signature(second)


# ---------------------------------------------------------------------------
# Midnight rollover
#
# The upstream answers 404 with {"status": "FAIL"} for a day that has no calls
# yet - the same 404 it gives for a date outside retention. Left to
# raise_for_status that read as "the feed is unreachable", so between 00:00:00
# and the first call of the day the board would have shown a connection error
# rather than an empty table. Every night.
# ---------------------------------------------------------------------------


def test_a_day_with_no_calls_yet_reads_as_empty_not_unreachable():
    helpers.stub_call_log_http(call_log, helpers.FakeResponse(404, {"status": "FAIL"}))
    today = call_log.bangkok_calendar_day()
    assert asyncio.run(call_log._fetch_call_logs(today, {})) == []


def test_a_404_for_a_past_day_stays_unknown():
    """For a date whose records have simply aged out, "no calls" would be a
    false statement rather than a gap - so it renders as unavailable instead."""
    helpers.stub_call_log_http(call_log, helpers.FakeResponse(404, {"status": "FAIL"}))
    long_ago = call_log.bangkok_calendar_day() - dt.timedelta(days=400)
    assert asyncio.run(call_log._fetch_call_logs(long_ago, {})) is None


def test_the_empty_table_is_still_marked_available_after_rollover():
    """What the widget actually keys on: available means "we read the feed",
    so an empty list renders "ยังไม่มีการบันทึกข้อมูล" and not a connection error."""
    helpers.stub_call_log_http(call_log, helpers.FakeResponse(404, {"status": "FAIL"}))
    payload = asyncio.run(call_log.get_call_log())
    assert payload["calls_available"] is True and payload["calls"] == []
    assert payload["missed_available"] is True and payload["missed"] == []
    assert payload["fetched_at"] is not None


def test_a_real_outage_is_still_reported_as_unavailable():
    """The 404 rule must not swallow genuine failures - a 500 still blanks."""
    helpers.stub_call_log_http(call_log, helpers.FakeResponse(500, {"status": "FAIL"}))
    payload = asyncio.run(call_log.get_call_log())
    assert payload["calls_available"] is False and payload["missed_available"] is False
    assert payload["fetched_at"] is None


def test_the_day_is_recomputed_every_cycle():
    """Nothing is cached per day, so the tables follow the Bangkok calendar
    without a scheduled rollover: the poll after midnight queries the new day
    and the previous day's rows drop off on their own."""
    helpers.stub_call_log(call_log, abandoned=[], calls=[])
    today = call_log.bangkok_calendar_day()
    assert asyncio.run(call_log.get_call_log())["day"] == today.isoformat()


def test_a_queue_full_row_names_no_agent():
    """It never reached a desk. `destination` holds the queue ("942"), and
    `agent_username` is empty - so naming anyone would invent an agent called
    942 who handled a call nobody took."""
    body = {"data": [
        {"action": "QUEUE_FULL_ABANDON", "destination": "942", "agent_username": "",
         "a_number": "0930378017", "call_begin_at": 1788166966, "call_end_at": 1788166966},
        _log_row(destination="94017"),
    ]}
    out = call_log.parse_call_logs(body, {"94017": "ฮาลีเม๊าะ"})
    assert out[0]["status"] == "queue_full"
    assert out[0]["reached_agent"] is False
    assert out[0]["agent"] is None and out[0]["extension"] is None
    assert out[1]["reached_agent"] is True and out[1]["agent"] == "ฮาลีเม๊าะ"


def test_a_queue_destination_names_no_agent_whatever_the_action_is_called():
    """Structural, not keyed on the action name. The action set is the
    upstream's to extend; no new member of it can make "942" five digits."""
    body = {"data": [
        {"action": "SOME_NEW_QUEUE_EVENT", "destination": "942",
         "call_begin_at": 1788166966, "call_end_at": 1788166970},
        {"action": "SOME_NEW_QUEUE_EVENT", "destination": "94017",
         "a_number": "0812345678", "call_begin_at": 1788166966, "call_end_at": 1788166970},
    ]}
    out = call_log.parse_call_logs(body, {})
    assert [r["reached_agent"] for r in out] == [False, True]
    # Both still appear, and both say what the upstream actually called it.
    assert [r["status"] for r in out] == ["unknown", "unknown"]
    assert [r["action"] for r in out] == ["SOME_NEW_QUEUE_EVENT", "SOME_NEW_QUEUE_EVENT"]


def test_a_mapped_status_carries_no_raw_action():
    """`action` is set only when the status is unknown, so the widget shows the
    raw value exactly when it has nothing better to show."""
    assert call_log.parse_call_logs({"data": [_log_row()]}, {})[0]["action"] is None


def test_reached_an_agent_separates_desks_from_queues():
    assert call_log.reached_an_agent("94009") is True
    assert call_log.reached_an_agent("942") is False
    assert call_log.reached_an_agent("") is False
    assert call_log.reached_an_agent("94O09") is False
