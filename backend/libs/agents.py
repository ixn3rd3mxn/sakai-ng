"""Live on-duty status for the branch's call-centre agents.

Source is the same NIEMS service that backs the official dashboard's agent
board. Two mappings sit on top of it, and they are stored differently on
purpose:

* **role** (`agent_type_id` -> Thai label) is hardcoded below. It is an enum
  owned by the upstream system, it has two values we care about, and nobody at
  the dispatch centre will ever edit it. A new type would need a code decision
  anyway (show it? what colour?), so a database row would not save a deploy.

* **name** (`agent_extension` -> person) lives in Mongo. The on-duty roster
  rotates every shift - two samples forty minutes apart shared no extensions
  at all - so the mapping has to cover every member of staff at the branch,
  not the handful signed in right now, and it churns with hiring and
  transfers. A supervisor must be able to correct a name without a deploy.

Note `agent_username` is a Thai national ID. It is deliberately never stored
or logged here; the name mapping is keyed on the extension instead, which
keeps PDPA-relevant identifiers out of our database entirely.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time as time_module
from datetime import datetime
from typing import Optional

import httpx
from pymongo.errors import PyMongoError
from starlette.concurrency import run_in_threadpool

from libs import feed_health
from libs.configs import db
from libs.shift import BANGKOK_TZ

logger = logging.getLogger(__name__)

AGENTS_URL = os.environ.get(
    "CALL_STATS_AGENTS_URL",
    "https://rnis-iqm-ptn.niems.go.th/v2/agent",
)
BRANCH_ID = os.environ.get("CALL_STATS_BRANCH_ID", "94")

# Agent status is the fastest-moving thing on the board: a phone rings, is
# answered and is hung up inside a minute, and the whole point of the section
# is answering "who is free right now". The upstream exposes no push endpoint
# (every SSE/stream path 404s), so this interval *is* the board's latency - at
# 10s a call could start and end before the board noticed.
#
# 2s is affordable because the feed answers in ~90ms and this is one shared
# loop: 30 requests a minute in total, no matter how many boards are open, and
# only while at least one of them is being watched.
POLL_SECONDS = int(os.environ.get("AGENTS_POLL_SECONDS", "2"))
# Lowered from 15s once a failure stopped being visible to the viewer. While a
# failed poll emptied the board there was little point retrying hard - the
# damage was already on screen - so backing off was the lesser evil. With the
# last good roster held over (see `_payload`) a failure costs nothing until the
# grace window runs out, which makes recovering quickly worth far more than the
# handful of requests it spends.
RETRY_SECONDS = int(os.environ.get("AGENTS_RETRY_SECONDS", "5"))
# How long a held-over roster may be served before the board admits it does not
# know. Fifteen retries at RETRY_SECONDS, and well past any transient blip: if
# the feed has been unreadable for half a minute, something is actually wrong
# and a supervisor should see that rather than a frozen roster.
GRACE_SECONDS = int(os.environ.get("AGENTS_GRACE_SECONDS", "30"))
TIMEOUT_SECONDS = float(os.environ.get("AGENTS_TIMEOUT_SECONDS", "10"))
# The name mapping changes at hiring speed, not at poll speed.
NAMES_TTL_SECONDS = int(os.environ.get("AGENTS_NAMES_TTL_SECONDS", "60"))

# The upstream lists every agent once per queue they belong to: a call taker
# appears as both type 1 and type 6 ("Call Taker and Non Emergency Swarm").
# Keeping only these two ids yields exactly one row per agent - verified
# against the live feed - so no further de-duplication is needed.
ROLES: dict[int, str] = {
    1: "รับแจ้งเหตุ",
    5: "หัวหน้าปฏิบัติการ",
}

# Only OFFLINE is hidden, and this is a deny-list on purpose.
#
# It began as an allow-list of the four documented actions, which quietly
# dropped anything else - and a 15-minute watch of the live feed turned up
# RINGING, undocumented and unlisted. An agent whose phone was ringing
# therefore disappeared from the board for the duration of the ring and
# reappeared when it was answered. Flicker like that on a dispatch board is
# worse than an unfamiliar label, and the next unknown action would do it
# again. Unknown actions now render as `unknown` carrying the raw value, so a
# new upstream state shows up as something to ask about rather than as an
# agent going missing.
#
# OFFLINE is safe to hide: across every sample it appeared only on the spare
# extensions (username "EXT_94501" rather than a national ID), never on a
# person. Staff who go off duty are removed from the payload entirely.
HIDDEN_ACTIONS = frozenset({"OFFLINE"})

STATUSES: dict[str, str] = {
    "ANSWER": "on_call",
    "RINGING": "ringing",
    "DND_SHORT": "break",
    "DND_OFF": "available",
}


def parse_agents(body: dict, names: dict[str, str]) -> list[dict]:
    """Rows the board should show, ordered for a wall display.

    Sorted by role then extension - deliberately *not* by status. Status is
    the one field that changes minute to minute, so sorting on it would make
    cards jump position every time somebody answers a call. A fixed layout
    lets operators learn where each colleague sits; the status is carried by
    colour and text instead.
    """
    agents = []
    for row in body.get("data") or []:
        if not isinstance(row, dict):
            continue
        role = ROLES.get(row.get("agent_type_id"))
        action = row.get("action")
        if role is None or action in HIDDEN_ACTIONS:
            continue
        extension = str(row.get("agent_extension") or "")
        if not extension:
            continue
        status = STATUSES.get(action, "unknown")
        agents.append(
            {
                "extension": extension,
                # None when the extension is not in the mapping - a new hire,
                # say. The card still renders, showing the extension alone: an
                # on-duty agent must never disappear from the board because a
                # reference row is missing.
                "name": names.get(extension),
                "role_id": row.get("agent_type_id"),
                "role": role,
                "status": status,
                # Only set when `status` is "unknown", so the card can show
                # what the upstream actually said instead of a bare label.
                "action": action if status == "unknown" else None,
            }
        )

    # Supervisors first, then call takers by extension.
    agents.sort(key=lambda a: (0 if a["role_id"] == 5 else 1, a["extension"]))
    return agents


def newest_action_at(rows: list) -> int:
    """The most recent `action_at` across the raw feed, or 0 if it has none.

    Read from the raw rows rather than the parsed ones because `parse_agents`
    drops the field - the board shows a status, not a timestamp. It matters
    here for an entirely different reason: it is the only field in this feed
    that distinguishes a roster that is being maintained from one that was
    frozen when its host was retired. Statuses render identically either way,
    which is precisely how a decommissioned mirror passes for a healthy board.
    """
    newest = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = row.get("action_at")
        if isinstance(value, (int, float)) and not isinstance(value, bool) and int(value) > newest:
            newest = int(value)
    return newest


_client: Optional[httpx.AsyncClient] = None
_client_loop: Optional[asyncio.AbstractEventLoop] = None


def _http() -> httpx.AsyncClient:
    """One long-lived client, so the connection is kept alive between polls.

    This module originally opened a fresh `AsyncClient` per poll, which threw
    away the connection pool each time and paid a full TCP + TLS handshake on
    every single request: measured, 90ms per poll against 31ms with the
    connection reused. At a 2s interval that was ~59ms of pure handshake, 30
    times a minute, burning CPU on both ends for nothing.
    """
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


_names: dict[str, str] = {}
_names_at: float = 0.0


async def load_names() -> dict[str, str]:
    """Extension -> name from Mongo, cached.

    Public because libs.call_log needs the same mapping: the call log names
    the agent who took each call, and a second copy of this lookup would be
    a second cache to keep warm and a second place for a name to go stale.

    Returns whatever is cached if the database is unreachable. The board is
    far more useful showing extensions with no names than not rendering: this
    section's real data comes from the NIEMS feed, and Mongo only decorates it.
    """
    global _names, _names_at
    now = time_module.monotonic()
    # Guarded on the timestamp, not on the dict being non-empty. An empty
    # mapping is a perfectly normal state - it is what you get before the
    # collection is seeded - and testing the dict's truthiness meant that
    # state never counted as cached, so every single poll made a round trip
    # to Atlas. At a 2s interval that was 30 needless queries a minute.
    if _names_at and now - _names_at < NAMES_TTL_SECONDS:
        return _names

    def load() -> dict[str, str]:
        return {
            str(doc["agent_extension"]): doc["agent_name"]
            for doc in db.agents.find({}, {"agent_extension": 1, "agent_name": 1, "_id": 0})
            if doc.get("agent_extension") and doc.get("agent_name")
        }

    try:
        _names = await run_in_threadpool(load)
        _names_at = now
    except PyMongoError as exc:
        logger.warning("agent name mapping unavailable (%s); showing extensions only", exc)
    return _names


async def _fetch() -> Optional[list[dict]]:
    """Current agent rows, or None if the feed could not be read."""
    try:
        response = await _http().get(AGENTS_URL)
        response.raise_for_status()
        body = response.json()
        if body.get("status") != "OK":
            return None
        rows = body.get("data") or []
        parsed = parse_agents(body, await load_names())
        # A readable feed is not the same as a live one - see libs.feed_health
        # for the incident this exists to catch.
        feed_health.report_agents(
            raw_rows=len(rows),
            parsed_rows=len(parsed),
            newest_action_at=newest_action_at(rows),
        )
        return parsed
    except Exception as exc:
        logger.warning("agent feed unavailable (%s: %s)", type(exc).__name__, exc)
        logger.debug("agent feed error detail", exc_info=True)
        return None


def _counts(agents: list[dict]) -> dict[str, int]:
    counts = {key: 0 for key in ("on_call", "ringing", "break", "available", "unknown")}
    for agent in agents:
        counts[agent["status"]] = counts.get(agent["status"], 0) + 1
    counts["total"] = len(agents)
    return counts


# The last roster that was read successfully, kept so a failed poll can serve
# it instead of nothing. See `_payload` for why.
_last_good: Optional[list[dict]] = None
_last_good_at: float = 0.0
_last_good_fetched_at: Optional[str] = None


def _payload(agents: Optional[list[dict]]) -> dict:
    """The board's payload, with the last good roster held over on failure.

    Without this a single failed poll emptied the board: `agents` came back
    None, `available` went false, and the widget's own guard collapsed the
    roster to zero cards - so every card unmounted, every animation restarted,
    and because the loop then backed off, the blackout lasted the whole retry
    interval rather than one poll.

    That is the wrong trade for a feed polled every two seconds against a
    third party. A roster a few seconds old is still an accurate answer to
    "who is on duty"; an empty board is not an answer at all. This module
    already reasons this way about the Mongo name lookup, which keeps its
    cached names through a database outage - the roster feed is the more
    important of the two and had no equivalent.

    `stale` is what makes it honest: the data is held over, and the board says
    so rather than passing it off as current. Past `GRACE_SECONDS` the held
    roster is dropped, because at some point "who is on duty" genuinely is
    unknown and claiming otherwise would be worse than blanking.
    """
    global _last_good, _last_good_at, _last_good_fetched_at

    if agents is not None:
        _last_good = agents
        _last_good_at = time_module.monotonic()
        _last_good_fetched_at = datetime.now(BANGKOK_TZ).replace(tzinfo=None).isoformat()
        return {
            "available": True,
            "stale": False,
            "agents": agents,
            "counts": _counts(agents),
            "fetched_at": _last_good_fetched_at,
            "health": feed_health.for_feed(feed_health.AGENTS),
        }

    if _last_good is not None and time_module.monotonic() - _last_good_at < GRACE_SECONDS:
        # `fetched_at` deliberately stays at the last successful read, so the
        # board can say how old this is instead of restating "now".
        return {
            "available": True,
            "stale": True,
            "agents": _last_good,
            "counts": _counts(_last_good),
            "fetched_at": _last_good_fetched_at,
            "health": feed_health.for_feed(feed_health.AGENTS),
        }

    # Distinguishable from "nobody on duty": the board shows an error rather
    # than an empty roster, which would read as an unmanned centre.
    return {
        "available": False,
        "stale": True,
        "agents": [],
        "counts": {},
        "fetched_at": None,
        "health": feed_health.for_feed(feed_health.AGENTS),
    }


async def get_agents() -> dict:
    return _payload(await _fetch())


# ---------------------------------------------------------------------------
# Live broadcast - same shape as libs.call_stats: one poll loop shared by every
# connection, started on the first subscriber and cancelled with the last, so a
# board nobody is watching polls nothing.
# ---------------------------------------------------------------------------

_subscribers: set[asyncio.Queue] = set()
_poller: Optional[asyncio.Task] = None
_latest: Optional[dict] = None
_latest_signature: Optional[str] = None


def _signature(payload: dict) -> str:
    # `fetched_at` is included so an idle board still receives a frame each
    # poll and can prove it is alive - see the same decision in call_stats.
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


async def _poll_loop() -> None:
    global _latest, _latest_signature
    while True:
        payload = await get_agents()
        signature = _signature(payload)
        if signature != _latest_signature:
            _latest, _latest_signature = payload, signature
            for queue in list(_subscribers):
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                queue.put_nowait(payload)
        # Keyed on `stale`, not `available`: a held-over payload is still
        # available, and pacing on that would poll a failing upstream at the
        # healthy 2s rate for the whole grace window.
        await asyncio.sleep(POLL_SECONDS if not payload["stale"] else RETRY_SECONDS)


async def subscribe() -> asyncio.Queue:
    global _poller
    queue: asyncio.Queue = asyncio.Queue(maxsize=1)
    _subscribers.add(queue)
    if _poller is None or _poller.done():
        _poller = asyncio.create_task(_poll_loop())
    if _latest is not None:
        queue.put_nowait(_latest)
    return queue


def unsubscribe(queue: asyncio.Queue) -> None:
    global _poller
    _subscribers.discard(queue)
    if not _subscribers and _poller is not None:
        _poller.cancel()
        _poller = None


async def aclose() -> None:
    global _poller, _client, _client_loop
    if _poller is not None:
        _poller.cancel()
        _poller = None
    if _client is not None:
        await _client.aclose()
        _client = None
        _client_loop = None
