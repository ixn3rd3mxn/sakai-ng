"""Per-call detail for the two log tables on the automate dashboard.

Two upstream feeds, one for each table, each on its own poll loop. They cost
wildly different amounts, which is worth knowing before changing the interval
- and is why they are no longer read together in one cycle:

* **abandoned** (`/v2/abandon/today`) ~2.4s even with the connection
  warm. Grouped by caller, not by call: one row per number, carrying `amount`
  (how many times that number gave up today) and the timestamp of its most
  recent attempt. Eleven rows can therefore represent more than eleven
  abandoned calls.

* **call logs** (`/v2/call-logs`) ~35ms warm. One row per call, and the only
  feed on this dashboard that is per-call rather than pre-aggregated.

Note the call-log feed does not reconcile with `/v2/stats/summary/times`: a
sampled day had 80 call-log rows against roughly 117 answered calls implied by
that endpoint's totals. Whatever the reason - a queue or source type the log
omits - this table should be read as recent activity, not as a complete audit
of the day. The same caveat the six counter cards carry.

`agent_username` in the call-log feed is a Thai national ID. It is dropped in
`parse_call_logs` and never stored or logged, exactly as in libs.agents; the
agent is identified by extension and named from our own mapping instead.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import date as date_cls
from datetime import datetime
from typing import Optional

import httpx

from libs import agents, broadcast, feed_health, relay
from libs.call_stats import bangkok_calendar_day, day_epoch_window
from libs.shift import BANGKOK_TZ

logger = logging.getLogger(__name__)

ABANDON_URL = os.environ.get(
    "CALL_LOG_ABANDON_URL",
    "https://rnis-iqm-ptn.niems.go.th/v2/abandon/today",
)
CALL_LOGS_URL = os.environ.get(
    "CALL_LOG_URL",
    "https://rnis-iqm-ptn.niems.go.th/v2/call-logs",
)
BRANCH_ID = os.environ.get("CALL_STATS_BRANCH_ID", "94")

# Far slower than the agent board's 2s, and deliberately. These are logs: a
# call that ended appears a few seconds later either way, and nobody is
# watching for the exact moment a row lands. The abandoned feed alone takes
# ~2.4s to answer, so a short interval would keep a request in flight most of
# the time for no gain.
POLL_SECONDS = int(os.environ.get("CALL_LOG_POLL_SECONDS", "20"))
RETRY_SECONDS = int(os.environ.get("CALL_LOG_RETRY_SECONDS", "30"))
# Generous because of the abandoned feed, not the call log.
TIMEOUT_SECONDS = float(os.environ.get("CALL_LOG_TIMEOUT_SECONDS", "30"))

# A full day at this branch runs to a few hundred calls, so one page covers it;
# the server accepted per_page=1000 without complaint. `_metadata.page_count`
# is still honoured in case a busier day ever exceeds this.
PER_PAGE = int(os.environ.get("CALL_LOG_PER_PAGE", "500"))
MAX_PAGES = int(os.environ.get("CALL_LOG_MAX_PAGES", "4"))

# Excluded from the answered-call table: the caller gave up while it was
# ringing. These rows still carry a `destination` and an `agent_username`, so
# including them would attribute an unanswered call to an agent and print a
# one-second "duration" that is really ring time - it would look like staff
# were hanging up on people.
#
# A deny-list rather than an allow-list of HANGUP, for the reason set out in
# libs.agents: an allow-list silently drops anything new, and an unfamiliar
# action showing up in the table is easier to notice and ask about than a call
# that never appears at all.
# Every outcome the log records, mapped to a key the widget renders as a
# labelled tag.
#
# These rows used to be *excluded* - the table showed answered calls only,
# because an unanswered one rendered as an agent who had handled a call of
# 00:00:01, which read as staff hanging up on people. A status column removes
# that ambiguity at the source: the row can say what it is, so it no longer has
# to be hidden to avoid lying.
#
# Unknown actions map to "unknown" and carry the raw value through, the same
# deny-list-shaped reasoning as libs.agents: a new upstream outcome should show
# up as something to ask about, not as a call that silently never appears.
STATUSES: dict[str, str] = {
    "HANGUP": "answered",              # รับสาย
    "ABANDON": "abandoned",            # ไม่ได้รับสาย - the caller gave up
    "QUEUE_FULL_ABANDON": "queue_full",  # คิวเต็ม - never reached a desk
    "NO_ANSWER": "no_answer",          # เจ้าหน้าที่ไม่รับสาย - rang, nobody picked up
}

# How many digits an agent extension has ("94009"). Queues are shorter ("942").
EXTENSION_DIGITS = int(os.environ.get("CALL_LOG_EXTENSION_DIGITS", "5"))


def reached_an_agent(destination: str) -> bool:
    """Whether this row was ever delivered to somebody's desk.

    No longer decides whether a row is shown - every row is now shown, labelled
    by its status - but it still decides whether the agent column means
    anything. A call that reached a desk carries that agent's extension in
    `destination`; a queue-level event carries the queue instead ("942"), with
    an empty `agent_username` and nobody attached to it.

    Verified across a full day: HANGUP, ABANDON and NO_ANSWER all carry a real
    five-digit extension, QUEUE_FULL_ABANDON never does. Structural rather than
    keyed on the action name, so a future outcome nobody has seen still gets the
    right answer - no new action can make "942" five digits long.
    """
    return destination.isdigit() and len(destination) == EXTENSION_DIGITS


def _clock(epoch: int) -> str:
    """Epoch seconds -> `HH:MM:SS` on a Bangkok wall clock.

    Formatted here rather than in the browser for the same reason `fetched_at`
    is: the viewer's timezone is not the dispatch centre's, and a board opened
    from anywhere must read in Bangkok time.
    """
    return datetime.fromtimestamp(int(epoch), BANGKOK_TZ).strftime("%H:%M:%S")


def parse_abandoned(body: dict) -> list[dict]:
    """Callers who gave up today, most recent attempt first.

    The feed arrives in no useful order, so it is sorted here - newest at the
    top is what a table of "who did we miss" is read for.
    """
    rows = []
    for row in body.get("data") or []:
        if not isinstance(row, dict):
            continue
        at = row.get("lastest_at")
        if not at:
            continue
        anonymous = bool(row.get("is_anonymous"))
        source = str(row.get("source") or "")
        rows.append(
            {
                # None when the caller withheld their number. The widget shows
                # a placeholder rather than an empty cell, which would read as
                # a rendering fault.
                "phone": None if anonymous or not source else source,
                "at": _clock(at),
                "at_epoch": int(at),
                # How many times this number tried and gave up today. Not
                # rendered at present; it is carried because without it a
                # caller who tried six times is indistinguishable from one who
                # tried once, which is the difference between a nuisance and
                # somebody in trouble who still cannot get through.
                "attempts": int(row.get("amount") or 1),
                "anonymous": anonymous,
            }
        )

    rows.sort(key=lambda r: r["at_epoch"], reverse=True)
    return rows


def parse_call_logs(body: dict, names: dict[str, str]) -> list[dict]:
    """Every logged call, most recent first, each carrying its outcome.

    `a_number` is the caller, not `source`: on a sampled day three rows had an
    agent extension in `source` (an internal transfer) while `a_number` held
    the outside number throughout.
    """
    rows = []
    for row in body.get("data") or []:
        if not isinstance(row, dict):
            continue
        begin, end = row.get("call_begin_at"), row.get("call_end_at")
        if not begin or not end:
            continue
        extension = str(row.get("destination") or "")
        if not extension:
            continue
        action = row.get("action")
        status = STATUSES.get(action, "unknown")
        reached = reached_an_agent(extension)
        rows.append(
            {
                # Only meaningful when the call actually reached a desk. A
                # queue-full row carries the queue in `destination`, so naming
                # it would invent an agent called 942 who handled the call.
                "agent": names.get(extension) if reached else None,
                "extension": extension if reached else None,
                "reached_agent": reached,
                "phone": str(row.get("a_number") or ""),
                "answered_at": _clock(begin),
                "hung_up_at": _clock(end),
                # For an answered call this is talk time; for the rest it is how
                # long the caller waited before the call ended. The column is
                # labelled neutrally for that reason.
                #
                # Clamped at zero: a sampled day contained one row whose end
                # equalled its begin, and a negative duration would format as
                # a nonsense clock reading.
                "duration": max(0, int(end) - int(begin)),
                "status": status,
                # The raw value, set only when unmapped, so a new upstream
                # outcome shows what it actually said rather than a bare label.
                "action": action if status == "unknown" else None,
                "begin_epoch": int(begin),
            }
        )

    rows.sort(key=lambda r: r["begin_epoch"], reverse=True)
    return rows


_client: Optional[httpx.AsyncClient] = None
_client_loop: Optional[asyncio.AbstractEventLoop] = None


def _http() -> httpx.AsyncClient:
    """One long-lived client, rebuilt if the event loop changed - same
    reasoning as libs.agents._http, including the loop check that stops a
    cached client raising "Event loop is closed" across asyncio.run() calls."""
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop:
        _client = httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
        _client_loop = loop
    return _client


async def _fetch_abandoned() -> Optional[list[dict]]:
    try:
        response = await relay.get(_http(), ABANDON_URL)
        # See the note on _fetch_call_logs. This path is fixed and always
        # names today, so a 404 here can only mean "nobody has given up yet",
        # which is the normal state of the first hours of every day.
        if response.status_code == 404:
            return []
        response.raise_for_status()
        body = response.json()
        if body.get("status") != "OK":
            return None
        return parse_abandoned(body)
    except Exception as exc:
        logger.warning("abandoned-call feed unavailable (%s: %s)", type(exc).__name__, exc)
        logger.debug("abandoned-call feed error detail", exc_info=True)
        return None


async def _fetch_call_logs(day: date_cls, names: dict[str, str]) -> Optional[list[dict]]:
    start, end = day_epoch_window(day)
    collected: list[dict] = []
    try:
        for page in range(1, MAX_PAGES + 1):
            response = await relay.get(
                _http(),
                CALL_LOGS_URL,
                {
                    "page": page,
                    "per_page": PER_PAGE,
                    "branch_id": BRANCH_ID,
                    "start_date": start,
                    "end_date": end,
                },
            )
            # A day with no calls yet answers 404 with {"status": "FAIL"} -
            # the same 404 it gives for a date outside retention. Left to
            # raise_for_status this became "could not read the feed", so from
            # 00:00:00 until the first call of the day the board would have
            # claimed the source was unreachable, every night.
            #
            # Which of the two a 404 means is the caller's to decide, exactly
            # as in libs.call_stats: for today the day certainly exists, so
            # 404 is an empty day. For any other date it is genuinely unknown
            # and stays None, because rendering "no calls" for a date whose
            # records have simply aged out would be a false statement rather
            # than a gap.
            if response.status_code == 404:
                return [] if day == bangkok_calendar_day() else None
            response.raise_for_status()
            body = response.json()
            if body.get("status") != "OK":
                return None
            collected.extend(parse_call_logs(body, names))
            # One page covers a normal day; this only matters on a day busy
            # enough to exceed PER_PAGE.
            if page >= int((body.get("_metadata") or {}).get("page_count") or 1):
                break
    except Exception as exc:
        logger.warning("call-log feed unavailable (%s: %s)", type(exc).__name__, exc)
        logger.debug("call-log feed error detail", exc_info=True)
        return None

    collected.sort(key=lambda r: r["begin_epoch"], reverse=True)
    return collected


def _fetched_at(*readable: bool) -> Optional[str]:
    """Naive Bangkok wall-clock, or None when nothing was actually read."""
    return datetime.now(BANGKOK_TZ).replace(tzinfo=None).isoformat() if any(readable) else None


async def get_missed() -> dict:
    """The abandoned-call table on its own.

    Today only, always: the upstream path is fixed (`/v2/abandon/today`) and
    takes no day.
    """
    missed = await _fetch_abandoned()
    return {
        "day": bangkok_calendar_day().isoformat(),
        # A flag rather than an empty list: an empty list means "none today",
        # which is a real and reassuring statement, while an unreadable feed
        # means nothing is known. The two must not render the same way.
        "missed_available": missed is not None,
        "missed": missed or [],
        "fetched_at": _fetched_at(missed is not None),
        "health": feed_health.for_feed(feed_health.CALL_LOG),
    }


async def get_calls(day: Optional[date_cls] = None) -> dict:
    """The answered-call table on its own."""
    target = day or bangkok_calendar_day()
    names = await agents.load_names()
    calls = await _fetch_call_logs(target, names)

    # This feed is the independent witness the counters are checked against:
    # it lists calls one by one over a different endpoint, so it can contradict
    # a summary feed claiming the day was silent. See libs.feed_health. Only
    # this half reports - the abandoned table takes no part in any check, so
    # a board showing it alone has nothing to say to the health module.
    feed_health.report_call_log(
        day=target.isoformat(),
        calls_available=calls is not None,
        calls=len(calls or []),
    )

    return {
        "day": target.isoformat(),
        "calls_available": calls is not None,
        "calls": calls or [],
        "fetched_at": _fetched_at(calls is not None),
        "health": feed_health.for_feed(feed_health.CALL_LOG),
    }


async def get_call_log(day: Optional[date_cls] = None) -> dict:
    """Both tables in one payload, for the one-shot GET.

    The two feeds are fetched concurrently and their failures are independent:
    the abandoned feed is roughly seventy times slower, and one being
    unreachable must not blank the other's table.

    The live boards do not use this: each table streams its own half (see the
    broadcast section), so a board with one table switched off does not keep
    the other feed's upstream busy.
    """
    missed, calls = await asyncio.gather(get_missed(), get_calls(day))
    return {
        **missed,
        **calls,
        "fetched_at": calls["fetched_at"] or missed["fetched_at"],
        # Read after both halves, so a contradiction the calls half just
        # raised is on this payload rather than one cycle late.
        "health": feed_health.for_feed(feed_health.CALL_LOG),
    }


# ---------------------------------------------------------------------------
# Live broadcast - one poll loop per table (libs.broadcast.Feed), each shared
# by every connection to it and running only while one exists.
#
# Two loops rather than one carrying both tables, because the two feeds cost
# so differently. The abandoned feed takes ~2.4s per read; a wall display that
# shows the stat rows and the roster and never scrolls down to either table
# was nonetheless keeping both feeds polled around the clock. With one loop
# per table, a board switches a table off and that table's upstream goes
# quiet - and the ~35ms call-log feed no longer waits on the slow one to be
# gathered alongside it.
# ---------------------------------------------------------------------------

# `fetched_at` is in the signed payload so an idle board still receives a
# frame each poll and can prove it is alive - see the same decision in
# call_stats. Kept as a module name because the tests read it.
_signature = broadcast.signature

missed_feed = broadcast.Feed(
    "call-log-missed",
    get_missed,
    lambda payload: POLL_SECONDS if payload["missed_available"] else RETRY_SECONDS,
    RETRY_SECONDS,
)
calls_feed = broadcast.Feed(
    "call-log-calls",
    get_calls,
    lambda payload: POLL_SECONDS if payload["calls_available"] else RETRY_SECONDS,
    RETRY_SECONDS,
)


async def aclose() -> None:
    global _client, _client_loop
    missed_feed.close()
    calls_feed.close()
    if _client is not None:
        await _client.aclose()
        _client = None
        _client_loop = None
