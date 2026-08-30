"""Daily call-centre statistics pulled from the NIEMS RNIS summary API.

Two things make this worth its own module rather than a call inlined into an
endpoint:

1.  **The day boundary is Bangkok midnight, not the operational day.**
    Everything else in this backend means "08:30 -> next-day 08:30" when it
    says *day* (see `libs.shift`). This feed does not: the upstream API is
    queried with an inclusive epoch range covering a plain calendar day,
    00:00:00 -> 23:59:59 Asia/Bangkok. Reusing `get_operational_day` here
    would silently query the wrong 24 hours, so the two live side by side and
    this one is named `bangkok_calendar_day` to keep them apart.

2.  **The upstream is a shared external service.** Every open SSE connection
    would otherwise poll it independently. The cache below collapses all of
    them onto one request per poll interval, per day.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time as time_module
from dataclasses import asdict, dataclass, replace
from datetime import date as date_cls, datetime, time, timedelta
from typing import Optional

import httpx

from libs.shift import BANGKOK_TZ

logger = logging.getLogger(__name__)

BASE_URL = os.environ.get(
    "CALL_STATS_URL",
    "https://rnis-api-qm.niems.go.th/v2/stats/summary/summaries",
)
BRANCH_ID = os.environ.get("CALL_STATS_BRANCH_ID", "94")
ORG_CODE = os.environ.get("CALL_STATS_ORG_CODE", "94")

# Second source, used for today only. `BASE_URL` reads a precomputed rollup
# (4-7ms per request) that a scheduled job refreshes; measured, it sits on one
# value for 10+ minutes and then jumps in a batch. This one aggregates from raw
# records on every request (~370ms) and tracks calls as they land.
#
# It cannot replace `BASE_URL`: it has no `queue_full_abandon`, and it is
# today-only - any other path segment fails server-side trying to pull ~33MB
# through a 4MB gRPC cap - so history and the day-over-day comparison still
# come from the rollup.
LIVE_URL = os.environ.get(
    "CALL_STATS_LIVE_URL",
    "https://rnis-api-sse-dashboard.niems.go.th/v1/{branch}/summary/today",
)

# Which counters the live feed overrides. It also publishes `abandon` and
# `outgoing`, deliberately not taken from it: those stay on the rollup.
#
# The cost of that choice, recorded here because it is visible on the board:
# the two sources are observed at different moments, so the six cards do not
# reconcile. With live incoming=93/answer=79 against rollup abandon=11, a
# reader adding 79+11 gets 90 while "สายเข้าทั้งหมด" reads 93. Taking abandon
# and outgoing from the live feed too would make them add up exactly, at the
# cost of only `queue_full_abandon` lagging.
LIVE_FIELDS = ("incoming", "answer", "sla")

# Duration statistics. Same host, parameters and rollup semantics as
# `BASE_URL` - including the 404 for a range outside retention - just a
# different projection, so it is fetched and cached alongside the counters.
TIMES_URL = os.environ.get(
    "CALL_STATS_TIMES_URL",
    "https://rnis-api-qm.niems.go.th/v2/stats/summary/times",
)

# How long a successful response stays good for. The upstream aggregates a
# whole day, so sub-minute freshness buys nothing and just adds load to a
# service we do not own.
POLL_SECONDS = int(os.environ.get("CALL_STATS_POLL_SECONDS", "60"))
# The live feed is the only source here that can move second to second, so it
# is polled on its own much shorter clock. Polling the rollup this often would
# be pure waste - measured, it holds one value for 5-10 minutes and then jumps
# - while polling the live feed at the rollup's rate was what left the board a
# minute behind the official one.
LIVE_POLL_SECONDS = int(os.environ.get("CALL_STATS_LIVE_POLL_SECONDS", "5"))
# How long a good overlay may be reused after a failed refresh. Without it a
# single transient blip drops the three counters back to the rollup, which
# lags by minutes - so the numbers would visibly count *down*, which reads as
# corruption rather than staleness.
LIVE_GRACE_SECONDS = int(os.environ.get("CALL_STATS_LIVE_GRACE_SECONDS", "60"))
# After a failure, retry sooner than the normal interval - but not so fast
# that an upstream outage turns into a hammering loop.
RETRY_SECONDS = int(os.environ.get("CALL_STATS_RETRY_SECONDS", "15"))
TIMEOUT_SECONDS = float(os.environ.get("CALL_STATS_TIMEOUT_SECONDS", "10"))


def bangkok_calendar_day(now: Optional[datetime] = None) -> date_cls:
    """Today's date on a Bangkok wall clock, regardless of the host timezone.

    This is the *only* place the current day is decided. Deriving it from the
    server's local date (FastAPI Cloud runs UTC) would roll over at 07:00
    Bangkok time, showing seven hours of the new day's calls under yesterday's
    heading.
    """
    moment = now or datetime.now(BANGKOK_TZ)
    return moment.astimezone(BANGKOK_TZ).date()


def day_epoch_window(day: date_cls) -> tuple[int, int]:
    """`(from, until)` epoch seconds for `day` as the upstream expects them:
    00:00:00 inclusive to 23:59:59 inclusive, Bangkok time.

    `until` is built by subtracting one second from the *next* day's midnight
    rather than by combining `time(23, 59, 59)`, so it stays correct on any
    day that is not exactly 86400 seconds long.
    """
    start = datetime.combine(day, time(0, 0, 0), tzinfo=BANGKOK_TZ)
    next_start = datetime.combine(day + timedelta(days=1), time(0, 0, 0), tzinfo=BANGKOK_TZ)
    return int(start.timestamp()), int(next_start.timestamp()) - 1


@dataclass(frozen=True)
class CallStats:
    """The six counters the dashboard renders, and nothing else.

    The upstream also returns `missed_call`, `percent_*` and friends; they are
    dropped here so the API contract the frontend sees is the one the widget
    actually uses.
    """

    incoming: int = 0                # total incoming calls
    answer: int = 0                  # answered
    sla: int = 0                     # answered within SLA
    abandon: int = 0                 # missed
    queue_full_abandon: int = 0      # missed because the queue was full
    outgoing: int = 0                # outgoing


def parse_stats(body: dict) -> CallStats:
    """Sum the counters across every row in `data`.

    We always query a single `branch_id`, so in practice `data` holds exactly
    one row and the sum is that row. Summing rather than indexing `[0]` means
    a multi-branch response aggregates correctly instead of silently reporting
    one branch's numbers, and an empty `data` array - a legitimate state at
    00:05 before the first call of the day - yields zeros instead of an
    IndexError.
    """
    rows = body.get("data") or []
    totals = {field: 0 for field in CallStats.__dataclass_fields__}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for field in totals:
            value = row.get(field)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                totals[field] += int(value)
    return CallStats(**totals)


@dataclass(frozen=True)
class CallTimes:
    """The four duration statistics the second row renders, in **seconds**.

    The upstream also returns `*_user_wait`, `*_abandon` and `total_accept`;
    dropped for the same reason the counters drop their extras - the contract
    the frontend sees is the one it uses.
    """

    avg_accept: int = 0       # ค่าเฉลี่ยเวลาตอบรับ
    longest_accept: int = 0   # เวลาที่ตอบรับนานที่สุด
    avg_service: int = 0      # ค่าเฉลี่ยเวลาคุยสาย
    total_service: int = 0    # ระยะเวลารวมคุยสาย


def parse_times(body: dict) -> Optional[CallTimes]:
    """First row of `data`, or None when there is none.

    Unlike `parse_stats` this does *not* sum across rows. Counters add up;
    averages and maxima do not - summing two branches' `avg_service` would
    invent a number that describes neither. We always query one branch, so
    the first row is the answer; a multi-branch response would need a
    weighted mean and a max, which is deliberately not guessed at here.
    """
    rows = body.get("data") or []
    row = next((r for r in rows if isinstance(r, dict)), None)
    if row is None:
        return None
    values = {}
    for field in CallTimes.__dataclass_fields__:
        value = row.get(field)
        values[field] = int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0
    return CallTimes(**values)


@dataclass
class _Entry:
    """The cached result of one upstream fetch, scoped to the day it covers."""

    day: date_cls
    stats: CallStats
    fetched_at: datetime
    fetched_on: date_cls  # the Bangkok day this fetch happened on
    checked_at: float     # time.monotonic() of the last attempt, good or bad
    stale: bool           # the last attempt failed; `stats` is from an earlier one
    available: bool       # False when the upstream holds no data for `day`
    live: bool = False    # LIVE_FIELDS came from the live feed, not the rollup
    times: Optional["CallTimes"] = None  # None when the durations feed had nothing

    @property
    def final(self) -> bool:
        """True once `day` was already over at the moment it was fetched.

        A finished day's counters can never change again, so a final entry is
        reusable forever. The distinction matters at the rollover: today's
        entry is *not* final even after midnight makes it yesterday, because
        it was captured mid-day and is missing the rest of it. Reusing it
        would freeze yesterday at whatever it read when the operator last
        looked, so it gets one more fetch to pick up the closing numbers.
        """
        return self.day < self.fetched_on


# Keyed by day so browsing history does not evict today. Bounded because a
# user holding the prev-day button would otherwise grow it without limit.
_entries: dict[date_cls, _Entry] = {}
MAX_CACHED_DAYS = 150

_lock = asyncio.Lock()
_client: Optional[httpx.AsyncClient] = None
_client_loop: Optional[asyncio.AbstractEventLoop] = None


def _http() -> httpx.AsyncClient:
    global _client, _client_loop
    # Rebuilt if the event loop changed. An AsyncClient's connections belong
    # to the loop that opened them, so a cached one raises "Event loop is
    # closed" the moment it is reused on another - which is what any script
    # doing two separate asyncio.run() calls does, and what the test suite
    # does between cases. Under uvicorn there is one loop for the process and
    # this never triggers.
    loop = asyncio.get_running_loop()
    if _client is None or _client_loop is not loop:
        _client = httpx.AsyncClient(timeout=TIMEOUT_SECONDS)
        _client_loop = loop
    return _client


async def aclose() -> None:
    global _client, _client_loop, _poller
    if _poller is not None:
        _poller.cancel()
        _poller = None
    if _client is not None:
        await _client.aclose()
        _client = None
        _client_loop = None


async def _fetch(day: date_cls) -> Optional[CallStats]:
    """Upstream counters for `day`, or None when it holds no rows for that range.

    None is deliberately not folded into zeros here, because the upstream
    returns the byte-identical 404 for two situations that must not render
    the same way:

      * today, before the first call of the morning -> a true zero;
      * a day outside the ~110 days it retains -> no data at all.

    Rendering the second as six zeros would state that the centre handled no
    calls on a real past date, which is a false claim rather than a gap. The
    caller knows which day it asked for, so it decides.
    """
    range_from, range_until = day_epoch_window(day)
    response = await _http().get(
        BASE_URL,
        params={
            "branch_id": BRANCH_ID,
            "from": range_from,
            "until": range_until,
            "org_code": ORG_CODE,
        },
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return parse_stats(response.json())


async def _fetch_times(day: date_cls) -> Optional[CallTimes]:
    """Durations for `day`, or None when the upstream holds nothing for it.

    Same 404-means-no-rows contract as `_fetch`. Never raises: the durations
    are a second row of cards, so losing them must blank those four rather
    than fail the six that come from the counters feed.
    """
    range_from, range_until = day_epoch_window(day)
    try:
        response = await _http().get(
            TIMES_URL,
            params={
                "branch_id": BRANCH_ID,
                "from": range_from,
                "until": range_until,
                "org_code": ORG_CODE,
            },
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return parse_times(response.json())
    except Exception as exc:
        # One line, not a traceback: this path is expected and self-healing
        # (see `_fetch_live` below for the full reasoning).
        logger.warning("call-stats durations feed unavailable (%s: %s); the four duration cards will blank", type(exc).__name__, exc)
        logger.debug("call-stats durations feed error detail", exc_info=True)
        return None


async def _fetch_live() -> Optional[dict[str, int]]:
    """The live feed's `LIVE_FIELDS`, or None if it cannot be used.

    Never raises. This source is an overlay on top of the rollup, so any
    problem with it - unreachable, malformed, a field missing - degrades to
    the rollup's own (older) numbers rather than failing the request or
    blanking the card. Returning None simply means "no overlay this cycle".
    """
    try:
        response = await _http().get(LIVE_URL.format(branch=BRANCH_ID))
        if response.status_code != 200:
            return None
        body = response.json()
        if body.get("status") != "OK":
            return None
        summary = (body.get("data") or {}).get("summary") or {}
        values = {}
        for field in LIVE_FIELDS:
            value = summary.get(field)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values[field] = int(value)
        return values
    except Exception as exc:
        # Deliberately one line rather than a traceback. This is a designed,
        # self-healing degradation: the counters simply come from the rollup
        # for this cycle and the next poll recovers on its own. A transient
        # DNS blip or a dropped connection is routine over a 60s-forever poll
        # against a network we do not control, and printing 60 lines of stack
        # for it trains everyone to ignore the log - the traceback is still
        # available at DEBUG when something is actually being investigated.
        logger.warning("live call-stats feed unavailable (%s: %s); using the rollup for %s", type(exc).__name__, exc, ", ".join(LIVE_FIELDS))
        logger.debug("live call-stats feed error detail", exc_info=True)
        return None


_live_values: Optional[dict[str, int]] = None
_live_at: float = 0.0
_live_day: Optional[date_cls] = None
# Wall-clock of the last successful live read, distinct from the monotonic
# `_live_at` used for the TTL. This is what the board prints, because when an
# overlay is applied it - not the rollup's fetch time - is when the numbers on
# screen were actually read.
_live_fetched_at: Optional[datetime] = None


async def _live_overlay(now: float, force: bool, today: date_cls) -> Optional[dict[str, int]]:
    """The live feed's LIVE_FIELDS, on their own short TTL.

    Deliberately not part of the day entry: that is cached for POLL_SECONDS
    because the rollup behind it cannot change faster, and folding the overlay
    into it made the live counters inherit a staleness they do not have.

    Scoped to `today`. The feed serves only the current day, so at the Bangkok
    midnight rollover a cached overlay describes the day that just ended -
    and the grace window below would paint yesterday's totals onto the new
    day's card for up to a minute. Changing day discards it outright.
    """
    global _live_values, _live_at, _live_day
    if _live_day != today:
        _live_values, _live_at, _live_day = None, 0.0, today
    if not force and _live_values is not None and now - _live_at < LIVE_POLL_SECONDS:
        return _live_values

    values = await _fetch_live()
    # All or nothing: a partial overlay would mix observation times *within*
    # the three live fields, on top of the mismatch they already carry against
    # the rollup's three.
    if values and all(field in values for field in LIVE_FIELDS):
        global _live_fetched_at
        _live_values, _live_at = values, now
        _live_fetched_at = datetime.now(BANGKOK_TZ)
        return values
    if _live_values is not None and now - _live_at < LIVE_GRACE_SECONDS:
        return _live_values
    return None


async def get_call_stats(day: Optional[date_cls] = None, force: bool = False) -> dict:
    """Stats for `day` (default: the current Bangkok day) plus a day-over-day
    diff against the day before it.

    `force` applies to the **live overlay only**, and is passed by the poll
    loop so a sleep landing a few milliseconds short of the overlay's TTL
    cannot silently skip a cycle. It deliberately does not reach the rollup:
    the loop now ticks every LIVE_POLL_SECONDS, and forcing the rollup at that
    rate would refetch - twelve times a minute - a value that upstream only
    recomputes every five to ten minutes. The rollup keeps its own POLL_SECONDS
    TTL, and the comparison day is immutable once fetched.

    "Today" is re-resolved on every call, so a rollover past midnight simply
    changes which key is live. Yesterday's numbers can never be served under
    today's date, because entries are keyed by the day they actually cover.
    """
    today = bangkok_calendar_day()
    requested = day or today
    now = time_module.monotonic()

    async with _lock:
        entry = await _resolve(requested, today, now, force=False)
        # The day before, for the diff. Always cache-first: once fetched it is
        # a completed day, so this costs one upstream call ever - not one per
        # poll - and after a midnight rollover the new comparison day is
        # already in the cache from when it was "today".
        previous = await _resolve(requested - timedelta(days=1), today, now, force=False)
        # Today only: a finished day cannot move, and the live feed serves no
        # day but today anyway.
        overlay = await _live_overlay(now, force, today) if requested == today else None
        return _payload(entry, previous, today, overlay)


async def _resolve(day: date_cls, today: date_cls, now: float, force: bool) -> _Entry:
    """Cache-or-fetch one day. Assumes `_lock` is held.

    Never raises: an unreachable upstream yields an entry with
    `available=False` (or the last good one flagged stale), because a missing
    comparison day must degrade to "no diff", not fail the whole request.
    """
    cached = _entries.get(day)
    if cached is not None and not force:
        if cached.final:
            # A finished day never changes - no expiry, no upstream call.
            return cached
        # The TTL paces the *live* day. It must not apply to an entry for a
        # day that has since ended, because that entry was captured mid-day
        # and is missing the rest of it: letting the TTL short-circuit here
        # would serve those partial numbers as a completed day for a full
        # interval after midnight. Such an entry falls through and is
        # refetched once, which makes it final. `stale` still paces it, so an
        # unreachable upstream cannot turn that into a per-request retry loop.
        if cached.day == today or cached.stale:
            age_limit = RETRY_SECONDS if cached.stale else POLL_SECONDS
            if now - cached.checked_at < age_limit:
                return cached

    try:
        stats = await _fetch(day)
    except Exception:
        if cached is not None and cached.available:
            # Keep showing the last good numbers for *this same day*, flagged
            # stale so the widget can say so.
            cached.checked_at = now
            cached.stale = True
            return cached
        # Not remembered: a transport failure says nothing about whether the
        # source has data for this day, so it must not be cached as "no data".
        return _unavailable_entry(day, today, now)

    if stats is None:
        # The upstream has no rows for this range. Only today can read that as
        # a genuine zero (no calls yet this morning); for any other day it
        # means the data is not there - see `_fetch`.
        if day == today:
            stats = CallStats()
        else:
            return _remember(_unavailable_entry(day, today, now), today)

    return _remember(
        _Entry(
            day=day,
            stats=stats,
            fetched_at=datetime.now(BANGKOK_TZ),
            fetched_on=today,
            checked_at=now,
            stale=False,
            available=True,
            times=await _fetch_times(day),
        ),
        today,
    )


def _remember(entry: _Entry, today: date_cls) -> _Entry:
    _entries[entry.day] = entry
    if len(_entries) > MAX_CACHED_DAYS:
        # Evict the least recently checked, never today - it is the one key
        # that gets re-read continuously.
        evictable = [d for d in _entries if d != today]
        if evictable:
            del _entries[min(evictable, key=lambda d: _entries[d].checked_at)]
    return entry


def _unavailable_entry(day: date_cls, today: date_cls, now: float) -> _Entry:
    return _Entry(
        day=day,
        stats=CallStats(),
        fetched_at=datetime.now(BANGKOK_TZ),
        fetched_on=today,
        checked_at=now,
        stale=False,
        available=False,
        live=False,
    )


def _payload(entry: _Entry, previous: _Entry, today: date_cls, overlay: Optional[dict[str, int]] = None) -> dict:
    range_from, range_until = day_epoch_window(entry.day)

    stats = entry.stats
    live = False
    fetched_at = entry.fetched_at
    if overlay and entry.available:
        stats = replace(stats, **overlay)
        live = True
        # The overlay is the freshest thing being shown, so it dates the
        # payload. Reporting the rollup's timestamp here would have the board
        # claim its live counters were a minute old, and would collapse the
        # per-poll heartbeat back to the rollup's interval.
        if _live_fetched_at is not None:
            fetched_at = _live_fetched_at

    # Null rather than zeros whenever there is nothing honest to compare
    # against - a missing comparison day must read as "no comparison", not as
    # "no change". The frontend hides the line entirely in that case.
    diff = None
    if entry.available and previous.available:
        diff = {field: getattr(stats, field) - getattr(previous.stats, field) for field in CallStats.__dataclass_fields__}

    # Independent of `diff`: the durations feed can have both days while the
    # counters feed is missing one, or the reverse.
    #
    # Worth knowing when reading these: only two of the four are honest
    # comparisons mid-day. `avg_accept` and `avg_service` are averages, so
    # they do not depend on how much of the day has elapsed - "answer time
    # doubled, 6s -> 12s" is a real signal at 09:00. `longest_accept` is a
    # maximum that can only climb, and `total_service` is cumulative, so both
    # read low all morning for no reason other than the day being young.
    times_diff = None
    if entry.times is not None and previous.times is not None:
        times_diff = {field: getattr(entry.times, field) - getattr(previous.times, field) for field in CallTimes.__dataclass_fields__}

    return {
        "day": entry.day.isoformat(),
        # Mirrors the `is_current` the dispatch/history pages already key
        # their "viewing historical data" banners off, so this widget can use
        # the same convention instead of comparing dates in the browser.
        "is_current": entry.day == today,
        "range_from": range_from,
        "range_until": range_until,
        # Naive Bangkok wall-clock, matching how every other timestamp
        # crosses this API (see libs.shift.now_local).
        "fetched_at": fetched_at.replace(tzinfo=None).isoformat(),
        "available": entry.available,
        "stale": entry.stale,
        # True when incoming/answer/sla came from the live feed. False means
        # every counter is the rollup's, which lags by 10+ minutes - worth
        # surfacing because the board looks identical either way.
        "live": live,
        # Null when the durations feed had nothing for this day, so the four
        # duration cards can blank independently of the six counter cards.
        # Values are seconds; the frontend formats them.
        "times": asdict(entry.times) if entry.times is not None else None,
        # Per-duration change vs `compare_day`, in seconds and signed. Null
        # when either day's durations are missing - see `times_diff` above.
        "times_diff": times_diff,
        "compare_day": previous.day.isoformat(),
        # NOTE: when `day` is today this compares a day in progress against a
        # completed one, because the upstream ignores the time-of-day part of
        # its range - a one-hour window returns the same totals as the full
        # day, so "yesterday up to this hour" cannot be asked for. The diff is
        # therefore most negative just after midnight and converges as the day
        # fills in. Same semantics as the dispatch page's shift diff.
        "diff": diff,
        **asdict(stats),
    }


def seconds_until_next_bangkok_midnight(now: Optional[datetime] = None) -> float:
    """Seconds from `now` to the next 00:00:00 Asia/Bangkok.

    Computed from the zone rather than by counting 86400s from the last
    rollover, so it cannot accumulate drift over a long-running process.
    """
    moment = (now or datetime.now(BANGKOK_TZ)).astimezone(BANGKOK_TZ)
    next_midnight = datetime.combine(moment.date() + timedelta(days=1), time(0, 0, 0), tzinfo=BANGKOK_TZ)
    return (next_midnight - moment).total_seconds()


# ---------------------------------------------------------------------------
# Live broadcast
#
# One poll loop serves every connected client. Each SSE connection used to run
# its own timer, which meant the number of upstream-facing timers scaled with
# the number of open browser tabs even though they all wanted the identical
# payload. Now a connection is just a queue on `_subscribers`, and the loop
# only runs while at least one of them exists - a dashboard nobody is watching
# polls nothing at all.
# ---------------------------------------------------------------------------

_subscribers: set[asyncio.Queue] = set()
_poller: Optional[asyncio.Task] = None
_latest: Optional[dict] = None
_latest_signature: Optional[str] = None


def _signature(payload: dict) -> str:
    # `fetched_at` is deliberately included even though it moves on every
    # successful poll whether or not a counter changed.
    #
    # It was excluded at first, on the reasoning that it carried nothing the
    # widget renders differently. That was simply wrong: the widget prints it
    # ("ข้อมูลวันที่ ... ณ เวลา HH:MM"). Excluding it meant that during a quiet
    # stretch - and this source averages one call every 8-11 minutes, so quiet
    # stretches of 20+ minutes are normal - not one byte reached the browser
    # and the printed time froze at the last change. A wall display then looks
    # identical whether it is working perfectly or the backend died an hour
    # ago, which is the worse failure by far.
    #
    # The cost of including it is one ~300-byte frame per minute per client
    # (~430 KB/day). That is a cheap price for a board that visibly proves it
    # is alive.
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


async def _poll_loop() -> None:
    global _latest, _latest_signature
    while True:
        try:
            payload = await get_call_stats(force=True)
        except Exception:  # pragma: no cover - get_call_stats catches its own
            logger.exception("call-stats poll failed")
            await asyncio.sleep(RETRY_SECONDS)
            continue

        signature = _signature(payload)
        if signature != _latest_signature:
            _latest, _latest_signature = payload, signature
            for queue in list(_subscribers):
                if queue.full():
                    # A slow client should receive the newest payload, not a
                    # superseded one - drop what is queued rather than skip.
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(payload)

        # Wake for the next poll, or exactly at the Bangkok midnight rollover,
        # whichever comes first. Landing on the boundary is what swaps the
        # widget onto the new day the second it begins, with no tick loop
        # scanning for it and no scheduled job.
        # LIVE_POLL_SECONDS, not POLL_SECONDS: the loop must tick as fast as
        # the fastest source it publishes. The per-day entry has its own
        # longer TTL, so the rollup is still only refetched once a minute.
        interval = RETRY_SECONDS if payload["stale"] else LIVE_POLL_SECONDS
        await asyncio.sleep(min(interval, seconds_until_next_bangkok_midnight() + 1))


async def subscribe() -> asyncio.Queue:
    """Register for pushes, starting the shared poll loop if it is idle."""
    global _poller
    queue: asyncio.Queue = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)

    if _poller is None or _poller.done():
        _poller = asyncio.create_task(_poll_loop())

    # Hand a newly connected client the current state at once instead of
    # making it wait for the next change, which overnight could be hours.
    if _latest is not None:
        queue.put_nowait(_latest)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    global _poller
    _subscribers.discard(queue)
    if not _subscribers and _poller is not None:
        _poller.cancel()
        _poller = None
