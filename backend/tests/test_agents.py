"""Offline tests for libs.agents - no network, no database.

`parse_agents` is pure, so most of this needs no stubbing at all. What it
guards is the filtering: which rows are duplicates, which are spare desks, and
- the one that actually bit - what happens to a status nobody documented.
"""

from __future__ import annotations

import asyncio

from tests import helpers  # noqa: F401  - path/env setup, must precede libs
from libs import agents


def _row(ext, action, type_id=1, username=None):
    return {
        "agent_extension": ext,
        "action": action,
        "agent_type_id": type_id,
        "agent_username": username or f"user-{ext}",
    }


def test_type_filter_alone_yields_one_row_per_agent():
    """The upstream lists a call taker once per queue: type 1 and again as
    type 6 ('Call Taker and Non Emergency Swarm'). Keeping ids 1 and 5 is the
    whole de-duplication - verified against the live feed."""
    body = {"data": [
        _row("94018", "DND_OFF", 1),
        _row("94018", "DND_OFF", 6),
        _row("94011", "DND_OFF", 5),
    ]}
    out = agents.parse_agents(body, {})
    assert [a["extension"] for a in out] == ["94011", "94018"]
    assert {a["role_id"] for a in out} == {1, 5}


def test_offline_spare_desks_are_hidden():
    # Verified across every sample: OFFLINE only ever appears on unmanned
    # spare extensions, never on a person. Staff who go off duty are removed
    # from the payload entirely.
    body = {"data": [_row("94501", "OFFLINE", 1, "EXT_94501"), _row("94011", "DND_OFF", 5)]}
    out = agents.parse_agents(body, {})
    assert [a["extension"] for a in out] == ["94011"]


def test_an_unknown_status_is_shown_not_dropped():
    """The bug this suite exists for.

    An allow-list of the four documented actions silently dropped RINGING,
    which a live watch later found is real - so an agent whose phone was
    ringing vanished from the board for the duration of the ring and
    reappeared when it was answered. Anything unrecognised now renders,
    carrying the raw value.
    """
    body = {"data": [_row("94099", "WRAP_UP", 1)]}
    out = agents.parse_agents(body, {})
    assert len(out) == 1, "an on-duty agent must never disappear over an unmapped status"
    assert out[0]["status"] == "unknown"
    assert out[0]["action"] == "WRAP_UP", "the raw value is carried so it can be identified"


def test_every_observed_action_maps_as_expected():
    # All five confirmed against the live feed, with their action_ids:
    # 201 RINGING, 202 ANSWER, 401 DND_OFF, 402 DND_SHORT, 405 OFFLINE.
    body = {"data": [
        _row("94001", "ANSWER"), _row("94002", "RINGING"),
        _row("94003", "DND_SHORT"), _row("94004", "DND_OFF"),
    ]}
    got = {a["extension"]: a["status"] for a in agents.parse_agents(body, {})}
    assert got == {"94001": "on_call", "94002": "ringing", "94003": "break", "94004": "available"}


def test_status_is_matched_on_the_string_not_the_id():
    # action_id is deliberately not consulted, so a renumbering upstream
    # cannot silently change what the board shows.
    for aid in (202, 999, None):
        body = {"data": [dict(_row("94014", "ANSWER"), action_id=aid)]}
        assert agents.parse_agents(body, {})[0]["status"] == "on_call"


def test_ordering_is_stable_and_not_by_status():
    """Sorted by role then extension. Sorting by status would make cards jump
    position every time somebody answers a call, and a wall board that
    reshuffles itself is harder to read than one with a fixed layout."""
    body = {"data": [
        _row("94020", "DND_SHORT", 1), _row("94014", "ANSWER", 1),
        _row("94011", "DND_OFF", 5), _row("94018", "RINGING", 1),
    ]}
    before = [a["extension"] for a in agents.parse_agents(body, {})]
    # Same agents, all statuses changed - the order must not move.
    body2 = {"data": [
        _row("94020", "DND_OFF", 1), _row("94014", "DND_OFF", 1),
        _row("94011", "ANSWER", 5), _row("94018", "DND_OFF", 1),
    ]}
    after = [a["extension"] for a in agents.parse_agents(body2, {})]
    assert before == after == ["94011", "94014", "94018", "94020"]


def test_a_missing_name_never_hides_an_agent():
    body = {"data": [_row("94014", "DND_OFF"), _row("94099", "DND_OFF")]}
    out = agents.parse_agents(body, {"94014": "สมชาย"})
    assert len(out) == 2, "a new hire absent from the mapping is still on duty"
    assert out[0]["name"] == "สมชาย"
    assert out[1]["name"] is None, "the widget shows the extension in its place"


def test_counts_and_the_unreadable_feed_are_distinguishable():
    body = {"data": [
        _row("94001", "ANSWER"), _row("94002", "DND_OFF"), _row("94003", "DND_OFF"),
    ]}
    payload = agents._payload(agents.parse_agents(body, {}))
    assert payload["available"] is True
    assert payload["counts"]["available"] == 2 and payload["counts"]["on_call"] == 1
    assert payload["counts"]["total"] == 3

    # An unreadable feed is now marked by `stale` first and `available` only
    # once the held-over roster ages out - the rows are kept in between so a
    # blip does not empty the board. The distinction this test exists for
    # survives either way: a broken feed never looks like a quiet one.
    unreadable = agents._payload(None)
    assert unreadable["stale"] is True and unreadable["available"] is True
    assert len(unreadable["agents"]) == 3, "held over, not blanked"

    agents._last_good_at -= agents.GRACE_SECONDS + 1
    expired = agents._payload(None)
    assert expired["available"] is False and expired["agents"] == []

    # An empty roster is a real state ("nobody signed in"); an unreadable feed
    # is not. Rendering both as blank would let a broken feed pass as an
    # unmanned centre.
    empty = agents._payload([])
    assert empty["available"] is True and empty["stale"] is False and empty["agents"] == []


def test_the_name_cache_treats_an_empty_mapping_as_cached():
    """Guarded on the timestamp, not the dict's truthiness.

    An empty mapping is normal before the collection is seeded. Testing the
    dict meant that state never counted as cached, so every poll made a round
    trip to Atlas - 30 a minute at the current interval.
    """
    helpers.reset_agents(agents)
    calls = []

    # `db.agents` builds a *new* Collection on every attribute access, so
    # patching `db.agents.find` sets it on a throwaway object and the real
    # driver runs anyway. Replace the database handle instead.
    class FakeCollection:
        def find(self, *a, **k):
            calls.append(1)
            return iter(())  # no documents: the unseeded state

    class FakeDB:
        agents = FakeCollection()

    real_db = agents.db
    agents.db = FakeDB()
    try:
        asyncio.run(agents.load_names())
        asyncio.run(agents.load_names())
        asyncio.run(agents.load_names())
        assert len(calls) == 1, "an empty mapping must still satisfy the TTL"
    finally:
        agents.db = real_db


# ---------------------------------------------------------------------------
# Holding the roster over a failed poll
# ---------------------------------------------------------------------------


def _roster():
    return agents.parse_agents({"data": [_row("94011", "DND_OFF", 5), _row("94018", "ANSWER", 1)]}, {})


def test_a_failed_poll_keeps_the_last_good_roster():
    """The bug this section exists for.

    A single failed fetch used to empty the board: available went false, the
    widget's own guard collapsed the roster to zero cards, every card
    unmounted and every animation restarted - and because the loop then backed
    off, the blackout lasted the whole retry interval rather than one poll.
    A roster two seconds old still answers "who is on duty"; nothing does not.
    """
    agents._payload(_roster())
    held = agents._payload(None)
    assert held["available"] is True, "a blip must not empty a dispatch board"
    assert [a["extension"] for a in held["agents"]] == ["94011", "94018"]
    assert held["stale"] is True, "held-over rows must not be passed off as current"


def test_a_held_over_roster_keeps_the_timestamp_of_the_real_read():
    """So the board can say how old it is rather than restating 'now'."""
    fresh = agents._payload(_roster())
    held = agents._payload(None)
    assert held["fetched_at"] == fresh["fetched_at"]


def test_counts_describe_the_rows_actually_shown():
    """The counts are recomputed from whatever rows the payload carries, so a
    held-over roster reports its own tally rather than the empty dict a
    failure used to send."""
    assert agents._payload(_roster())["counts"]["total"] == 2
    assert agents._payload(None)["counts"]["total"] == 2


def test_the_roster_is_dropped_once_it_is_too_old_to_trust():
    """Past the grace window "who is on duty" genuinely is unknown, and saying
    so beats a frozen roster."""
    agents._payload(_roster())
    agents._last_good_at -= agents.GRACE_SECONDS + 1
    expired = agents._payload(None)
    assert expired["available"] is False and expired["agents"] == []
    assert expired["fetched_at"] is None


def test_a_failure_before_any_good_read_has_nothing_to_hold():
    fresh = agents._payload(None)
    assert fresh["available"] is False and fresh["agents"] == []


def test_recovery_replaces_the_held_roster():
    agents._payload(_roster())
    agents._payload(None)
    back = agents._payload(agents.parse_agents({"data": [_row("94004", "RINGING", 5)]}, {}))
    assert back["stale"] is False
    assert [a["extension"] for a in back["agents"]] == ["94004"]


def test_a_held_over_payload_still_differs_from_a_fresh_one():
    """The SSE loop only broadcasts on a signature change, so going stale has
    to be visible in the payload or the board would never learn about it."""
    fresh = agents._payload(_roster())
    held = agents._payload(None)
    assert agents._signature(fresh) != agents._signature(held)
