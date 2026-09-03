"""Invariant checks over the numbers the upstream feeds already return.

Why this module exists, stated plainly because it is not the obvious design:
watching for *failed* requests would not have caught the incident it was
written for.

In September 2026 NIEMS moved the call-centre APIs from `rnis-api-qm` and
`rnis-api-sse-dashboard` to `rnis-iqm-ptn`. The old hosts were not switched
off. They stayed up, kept answering HTTP 200 with `status: OK`, kept
returning well-formed rows that satisfied every parser in this package - and
the data behind them had stopped moving. Measured side by side on the morning
of the migration:

  * `summary/today` answered `incoming: 0` while the new host said 41;
  * the agent roster answered 17 rows, every one carrying `action_at: 0`;
  * yesterday's rollup answered 118 incoming against the new host's 183.

None of that is a failure. Uptime checks, status codes, timeouts, retries and
schema validation would all have stayed green while the wall board displayed
"0 calls today" to a room running an emergency line. A board that is visibly
broken gets fixed in minutes; a board that is confidently wrong does not get
fixed at all, because nobody knows to look.

So the checks here do not ask "did the request work". They ask "can this
still be true", using facts the board already has in hand:

  * a timestamp that cannot be real (`action_at` at the epoch);
  * two independent feeds contradicting each other about the same day;
  * counters that cannot add up the way they do.

Deliberately, almost none of them has a threshold to tune. A check that cries
wolf gets ignored, and an ignored check is worth less than no check at all -
it just adds noise while leaving the same hole. The one genuinely tunable
rule (`FRESH_SECONDS`) is set well past any quiet night rather than tight
enough to be clever, because the check that actually catches a dead mirror is
the impossible-timestamp one, which needs no threshold at all.

Two consumers, both cheap:

  * every feed payload carries `health`, so the board can say "this number
    cannot be trusted" instead of rendering the lie;
  * `/api/health` carries the whole verdict, and every transition is logged
    once - on the way in at WARNING/ERROR, on the way out at INFO - so a log
    drain can alert on it without this module knowing anything about how
    alerting is wired up.
"""

from __future__ import annotations

import logging
import os
import threading
import time as time_module
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from libs.shift import BANGKOK_TZ

logger = logging.getLogger(__name__)

# Feed names. Used both as the key an observation is filed under and as the
# tag a payload asks for its own issues with.
AGENTS = "agents"
CALL_STATS = "call_stats"
CALL_LOG = "call_log"

# An observation older than this is ignored rather than trusted. The poll
# loops only run while a board is connected (see `subscribe` in each module),
# so a feed nobody is watching stops reporting entirely - without this, the
# last thing it said before the final viewer closed their tab would keep
# driving verdicts indefinitely.
OBSERVATION_TTL_SECONDS = int(os.environ.get("FEED_HEALTH_OBSERVATION_TTL_SECONDS", "300"))

# The newest `action_at` in the agent roster may legitimately be some hours
# old. This is a 24-hour line, but a quiet night shift genuinely produces no
# state changes at all, and an agent who signed in at 22:00 and has not
# touched the phone since is not evidence of anything wrong. Six hours is
# well past that. It is not trying to be sensitive: the impossible-timestamp
# check below is what catches a dead mirror, and it needs no threshold.
FRESH_SECONDS = int(os.environ.get("FEED_HEALTH_AGENT_FRESH_SECONDS", "21600"))

# An `action_at` before this is not a stale timestamp, it is a broken one.
# The dead mirror served 0 (1970-01-01), so this catches that - and anything
# else that is not a real reading - without anybody having to decide what
# "recent" means.
PLAUSIBLE_EPOCH_FLOOR = 1577836800  # 2020-01-01T00:00:00Z

# How far the two counter sources may disagree before it is worth saying so.
# `libs.call_stats` documents that they are read moments apart and never
# reconcile exactly, so a small gap is the normal state and not a fault.
DIVERGENCE_TOLERANCE = int(os.environ.get("FEED_HEALTH_DIVERGENCE_TOLERANCE", "5"))


@dataclass(frozen=True)
class Issue:
    """One thing that cannot be true about the data currently on the board."""

    code: str
    # "error" means the data is contradicted by something else we hold;
    # "warning" means it looks wrong but could still be a timing artefact.
    severity: str
    # Which payloads should carry it. A contradiction between two feeds
    # belongs on both, because either one could be the liar.
    feeds: tuple[str, ...]
    # Written for a log line and for /api/health: English, specific, and
    # carrying the numbers that triggered it, so the person reading it at
    # 02:00 does not have to reproduce the check by hand. The board renders
    # its own short Thai message from `severity` instead of showing this.
    detail: str
    # True when the issue proves the numbers false rather than merely
    # suspect. The board blanks a discredited counter to a dash - the same
    # treatment a missing day already gets - because displaying a number we
    # know to be wrong is worse than displaying nothing.
    discredits: bool = False

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "severity": self.severity,
            "detail": self.detail,
            "discredits": self.discredits,
        }


_lock = threading.Lock()
# feed name -> the last facts it reported, plus when.
_observations: dict[str, dict] = {}
# code -> issue, for the issues currently standing. Kept so a transition can
# be told from a repeat: the agent feed reports every 2 seconds, and logging
# an unchanged verdict at that rate would bury the log it is meant to inform.
_active: dict[str, Issue] = {}


def _stamp(epoch: int) -> str:
    """An epoch as a Bangkok wall clock, for log lines and /api/health.

    Bangkok rather than UTC because every other timestamp that leaves this
    backend is Bangkok (see `libs.shift`), and a log line that silently
    switches timezone is how an investigation loses an hour.
    """
    if epoch <= 0:
        return f"{epoch} (the epoch)"
    return datetime.fromtimestamp(epoch, BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------


def _check_agents(obs: dict) -> list[Issue]:
    """Is the roster still being written to?

    `action_at` is the one field in the agent feed that proves the upstream is
    alive rather than merely reachable. Statuses look identical whether they
    changed a second ago or have been frozen since the host was
    decommissioned, which is exactly how a dead mirror renders as a normal
    board.
    """
    issues: list[Issue] = []
    rows = obs["raw_rows"]
    newest = obs["newest_action_at"]
    if rows <= 0:
        # An empty roster is a real state - nobody signed in - and says
        # nothing about the feed's health. `libs.agents` already separates
        # "empty" from "unreadable" on its own.
        return issues

    if newest < PLAUSIBLE_EPOCH_FLOOR:
        issues.append(
            Issue(
                code="agent_timestamps_impossible",
                severity="error",
                feeds=(AGENTS,),
                detail=(
                    f"the agent feed returned {rows} rows whose newest action_at is "
                    f"{_stamp(newest)}, which is not a real reading - the roster is not live. "
                    "This is the signature of a decommissioned host left running."
                ),
                discredits=True,
            )
        )
        # No point also reporting it as stale: the timestamp is not a reading
        # at all, so its age is meaningless.
        return issues

    age = obs["wall"] - newest
    if age > FRESH_SECONDS:
        issues.append(
            Issue(
                code="agent_feed_frozen",
                severity="warning",
                feeds=(AGENTS,),
                detail=(
                    f"the newest agent action is {_stamp(newest)}, {age / 3600:.1f}h old, "
                    f"across {rows} rows - the roster may have stopped updating"
                ),
            )
        )
    return issues


def _check_counters(obs: dict) -> list[Issue]:
    """Can the six counters be true at the same time?

    Note which direction is checked. `libs.call_stats` overlays live
    incoming/answer/sla onto rollup abandon/queue_full_abandon, and documents
    that answer + abandon can fall *short* of incoming because the two are
    observed moments apart. That shortfall is expected and is not checked
    here. The opposite - more calls answered and abandoned than ever arrived -
    cannot be produced by that skew.
    """
    issues: list[Issue] = []
    if not obs["available"]:
        return issues

    negative = [name for name in ("incoming", "answer", "abandon") if obs[name] < 0]
    if negative:
        issues.append(
            Issue(
                code="counters_negative",
                severity="error",
                feeds=(CALL_STATS,),
                detail=f"the summary feed returned a negative count for {', '.join(negative)}",
                discredits=True,
            )
        )

    handled = obs["answer"] + obs["abandon"]
    if handled > obs["incoming"] + DIVERGENCE_TOLERANCE:
        issues.append(
            Issue(
                code="counters_exceed_incoming",
                severity="warning",
                feeds=(CALL_STATS,),
                detail=(
                    f"answer ({obs['answer']}) + abandon ({obs['abandon']}) = {handled} "
                    f"exceeds incoming ({obs['incoming']}) by more than the "
                    f"{DIVERGENCE_TOLERANCE}-call tolerance the two sources are allowed"
                ),
            )
        )
    return issues


def _check_divergence(obs: dict) -> list[Issue]:
    """Is the live feed keeping up with the rollup it is supposed to lead?

    The rollup is recomputed every five to ten minutes; the live feed
    aggregates on every request. So the live number may legitimately run
    *ahead* of the rollup by whatever landed inside that lag, and routinely
    does. The reverse cannot happen while both are healthy - a rollup
    materially ahead of the feed that is meant to be fresher means the live
    feed has stopped moving.
    """
    rollup = obs.get("rollup_incoming")
    live = obs.get("live_incoming")
    if rollup is None or live is None:
        return []
    if rollup > live + DIVERGENCE_TOLERANCE:
        return [
            Issue(
                code="live_feed_behind_rollup",
                severity="warning",
                feeds=(CALL_STATS,),
                detail=(
                    f"the rollup reports {rollup} incoming for {obs['day']} while the live feed "
                    f"reports {live} - the live feed lags the slower source, which is backwards"
                ),
            )
        ]
    return []


def _check_hourly_agreement(obs: dict) -> list[Issue]:
    """Do the day's 24 buckets add up to the day's total?

    Two separate rollups over the same calls, fetched from two endpoints, so
    one of them going stale while the other refreshes shows up here as a
    straight arithmetic disagreement - no threshold, no judgement.

    Compared against the *rollup* incoming rather than the number on the
    board. The board's figure may carry the live overlay, which the hourly
    feed knows nothing about, so comparing with that would report the overlay
    working correctly as a fault every time a call landed inside the lag.

    A warning rather than a discredit: the two disagreeing proves one of them
    wrong without saying which, and blanking a figure that may well be the
    right one trades a known-wrong display for an unnecessarily blank board.
    """
    hourly = obs.get("hourly_incoming")
    rollup = obs.get("rollup_incoming")
    if hourly is None or rollup is None:
        return []
    if abs(hourly - rollup) > DIVERGENCE_TOLERANCE:
        return [
            Issue(
                code="hourly_disagrees_with_daily",
                severity="warning",
                feeds=(CALL_STATS,),
                detail=(
                    f"the hourly buckets for {obs['day']} sum to {hourly} incoming while the "
                    f"daily rollup reports {rollup} - two rollups over the same calls disagree, "
                    "so one of them is stale"
                ),
            )
        ]
    return []


def _check_contradiction(stats: dict, log: dict) -> list[Issue]:
    """Do two independent feeds agree that today had calls?

    This is the check that would have caught the migration on the first
    morning, and it is the cheapest one here: both numbers are already on the
    board, side by side, fetched over different endpoints. The summary feed
    saying nobody called while the call log lists the calls one by one is not
    a threshold or a heuristic - it is a flat contradiction, and one of the
    two is wrong.

    It needs no quiet-hours exemption for the same reason: on a genuinely
    silent night both feeds are empty and agree, so there is nothing to fire
    on.
    """
    if stats["day"] != log["day"]:
        # Mid-rollover, the two loops can briefly be on either side of Bangkok
        # midnight. Comparing across days would manufacture a contradiction
        # out of nothing once every 24 hours.
        return []
    if not (stats["available"] and log["calls_available"]):
        return []
    if stats["incoming"] == 0 and log["calls"] > 0:
        return [
            Issue(
                code="counters_contradicted_by_call_log",
                severity="error",
                feeds=(CALL_STATS, CALL_LOG),
                detail=(
                    f"the summary feed reports 0 incoming calls for {stats['day']} while the "
                    f"call log holds {log['calls']} calls for that same day - one of the two "
                    "endpoints is serving stale or empty data"
                ),
                discredits=True,
            )
        ]
    return []


# ---------------------------------------------------------------------------
# Reporting in
# ---------------------------------------------------------------------------


def _report(feed: str, facts: dict) -> None:
    with _lock:
        _observations[feed] = {
            **facts,
            "at": time_module.monotonic(),
            "wall": time_module.time(),
        }
        _recompute_locked()


def report_agents(*, raw_rows: int, parsed_rows: int, newest_action_at: int) -> None:
    _report(AGENTS, {"raw_rows": raw_rows, "parsed_rows": parsed_rows, "newest_action_at": newest_action_at})


def report_call_stats(
    *,
    day: str,
    available: bool,
    incoming: int,
    answer: int,
    abandon: int,
    rollup_incoming: Optional[int] = None,
    live_incoming: Optional[int] = None,
    hourly_incoming: Optional[int] = None,
) -> None:
    """Called for today only - see the call site.

    A past day is a settled record: the live feed does not serve it, so there
    is no second source to disagree with and no freshness to assert. Running
    these checks over one would mean an operator paging back through history
    could trip an alert about data that is behaving exactly as it should.
    """
    _report(
        CALL_STATS,
        {
            "day": day,
            "available": available,
            "incoming": incoming,
            "answer": answer,
            "abandon": abandon,
            "rollup_incoming": rollup_incoming,
            "live_incoming": live_incoming,
            "hourly_incoming": hourly_incoming,
        },
    )


def report_call_log(*, day: str, calls_available: bool, calls: int, missed: int) -> None:
    _report(CALL_LOG, {"day": day, "calls_available": calls_available, "calls": calls, "missed": missed})


def _recompute_locked() -> None:
    """Re-derive every verdict from every fresh observation. Assumes the lock.

    All of them, not just the feed that reported, because the checks are not
    all scoped to one feed: the contradiction reads both counter sources at
    once, and whichever loop ticked last is the one that must notice.
    """
    global _active

    now = time_module.monotonic()
    fresh = {feed: obs for feed, obs in _observations.items() if now - obs["at"] <= OBSERVATION_TTL_SECONDS}

    found: list[Issue] = []
    if AGENTS in fresh:
        found += _check_agents(fresh[AGENTS])
    if CALL_STATS in fresh:
        found += _check_counters(fresh[CALL_STATS])
        found += _check_divergence(fresh[CALL_STATS])
        found += _check_hourly_agreement(fresh[CALL_STATS])
        if CALL_LOG in fresh:
            found += _check_contradiction(fresh[CALL_STATS], fresh[CALL_LOG])

    _log_transitions_locked(found)
    _active = {issue.code: issue for issue in found}


def _log_transitions_locked(found: list[Issue]) -> None:
    """One line when an issue appears, one when it clears. Assumes the lock.

    Transitions only. The agent feed reports every two seconds, so logging a
    standing verdict each time would put 1,800 identical lines an hour into
    the drain and train everyone to filter out the one message this module
    exists to send.
    """
    seen = {issue.code for issue in found}
    for issue in found:
        if issue.code in _active:
            continue
        emit = logger.error if issue.severity == "error" else logger.warning
        emit("upstream feed health [%s] %s: %s", issue.severity, issue.code, issue.detail)
    for code in _active:
        if code not in seen:
            logger.info("upstream feed health recovered: %s", code)


# ---------------------------------------------------------------------------
# Reading out
# ---------------------------------------------------------------------------


def for_feed(feed: str) -> dict:
    """The health block a feed's payload carries.

    `trusted` is separate from `ok` on purpose. A warning means "this looks
    wrong, keep an eye on it" and the board goes on showing the numbers with a
    note; only a discrediting issue takes them off the screen. Collapsing the
    two would either hide numbers over a timing artefact or display numbers we
    know to be false, and both are worse than the distinction costing a field.
    """
    with _lock:
        mine = [issue for issue in _active.values() if feed in issue.feeds]
    return {
        "ok": not mine,
        "trusted": not any(issue.discredits for issue in mine),
        "issues": [issue.to_dict() for issue in mine],
    }


def snapshot() -> dict:
    """Everything, for /api/health."""
    now = time_module.monotonic()
    with _lock:
        issues = list(_active.values())
        observed = {feed: round(now - obs["at"], 1) for feed, obs in _observations.items()}
    return {
        "ok": not issues,
        "trusted": not any(issue.discredits for issue in issues),
        "issues": [{**issue.to_dict(), "feeds": list(issue.feeds)} for issue in issues],
        # Seconds since each feed last reported. A feed missing here has not
        # been polled at all this process - which is normal, the loops only run
        # while a board is open - and one with a large age is no longer being
        # checked, so its absence from `issues` means nothing.
        "observed_seconds_ago": observed,
    }


def reset() -> None:
    """Drop all state. For tests, which must not inherit each other's verdicts."""
    global _active
    with _lock:
        _observations.clear()
        _active = {}
