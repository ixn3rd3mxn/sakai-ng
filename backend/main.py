from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date as date_cls
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from libs import agents, aggregations, call_stats, events, lookups
from libs.configs import CORS_ORIGINS, db
from libs.models import IncidentCreateIn
from libs.shift import Shift, now_local, resolve_context, resolve_day_context


logger = logging.getLogger(__name__)

# How long startup waits for the reference collections before giving up and
# continuing without them. They are ~40 tiny documents, so a healthy Atlas
# answers in well under a second; anything near this bound means trouble.
LOOKUP_LOAD_TIMEOUT = 10


async def _load_lookups_forever() -> None:
    """Keep retrying `lookups.load()` until it succeeds.

    pymongo is synchronous and blocks for the full server-selection timeout
    when Mongo is unreachable, so it goes to the threadpool rather than
    stalling the event loop - and with it every call-stats stream.
    """
    delay = 2
    while True:
        try:
            await run_in_threadpool(lookups.load)
            logger.info("reference collections loaded")
            return
        except PyMongoError as exc:
            logger.warning("could not load reference collections (%s); retrying in %ss", exc, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # A Mongo outage must not take the whole API down with it. The call-stats
    # endpoints read from an external feed and touch no collection, so an
    # unreachable Atlas used to blank a widget whose own data source was
    # perfectly healthy - startup raised and nothing served at all. Load the
    # reference data in the background instead, retrying until it lands.
    retry_task: Optional[asyncio.Task] = None
    try:
        await asyncio.wait_for(run_in_threadpool(lookups.load), timeout=LOOKUP_LOAD_TIMEOUT)
    except (PyMongoError, asyncio.TimeoutError) as exc:
        logger.warning("starting without reference collections (%s)", exc)
        retry_task = asyncio.create_task(_load_lookups_forever())

    yield

    if retry_task is not None:
        retry_task.cancel()
    await call_stats.aclose()
    await agents.aclose()


app = FastAPI(title="EMS Dispatch Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_shift(value: Optional[str]) -> Optional[Shift]:
    if value is None:
        return None
    if value not in ("morning", "afternoon", "night"):
        raise HTTPException(status_code=400, detail="shift must be one of morning, afternoon, night")
    return value  # type: ignore[return-value]


def _resolve(date: Optional[date_cls], shift: Optional[str]):
    return resolve_context(date, _parse_shift(shift))


def _require_lookups() -> None:
    """Refuse to serve reference-backed data before the cache is populated.

    Startup is allowed to proceed without Mongo so the call-stats feed stays
    up, which means these endpoints can now be reached in a state that used to
    be impossible. Erroring here keeps the old fail-loud behaviour exactly
    where it matters: `aggregations` derives its breakdown rows *from* these
    dicts, so serving on an empty cache would return a valid-looking summary
    with no rows rather than an error - empty charts that read as a quiet
    shift instead of a broken backend.
    """
    if not lookups.loaded():
        raise HTTPException(status_code=503, detail="reference data unavailable; database not reachable yet")


@app.get("/api/health")
def health():
    try:
        db.command("ping")
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}") from exc
    return {"status": "ok", "database": "connected"}


@app.get("/api/context")
def get_context(date: Optional[date_cls] = Query(None), shift: Optional[str] = Query(None)):
    """Resolves operational_day/shift/team for the given (or current) date+shift.

    The frontend must use this endpoint - not client-side date math - to
    decide whether a given date/shift selection is "current" (e.g. to gate
    the save action or show the historical-data banner).
    """
    return _resolve(date, shift).to_dict()


@app.get("/api/lookups")
def get_lookups():
    _require_lookups()
    return {
        "call_types": [{"id": k, "name": v} for k, v in sorted(lookups.call_types().items())],
        "case_types": [{"id": k, "name": v} for k, v in sorted(lookups.case_types().items())],
        "cbd_categories": [
            {"id": k, "name": v["name"], "des": v["des"]} for k, v in sorted(lookups.cbd_categories().items())
        ],
        "reporting_channels": [{"id": k, "name": v} for k, v in sorted(lookups.reporting_channels().items())],
        "severity_levels": [
            {"id": k, "name": v["name"], "des": v["des"]} for k, v in sorted(lookups.severity_levels().items())
        ],
    }


@app.get("/api/dashboard/summary")
def get_summary(date: Optional[date_cls] = Query(None), shift: Optional[str] = Query(None)):
    _require_lookups()
    ctx = _resolve(date, shift)
    return aggregations.build_summary(ctx)


def _sse_data(payload: dict) -> str:
    """Same encoding the plain GET endpoints get from Starlette's
    JSONResponse: no inter-token spaces, and Thai text as raw UTF-8 not
    escaped one character at a time. `json.dumps` defaults to the opposite
    of both, which made every SSE frame ~24% larger than the same payload
    fetched over GET - and SSE is the one response the edge does not
    compress, so those bytes were paid in full on the wire."""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=str)


def _payload_signature(payload: dict) -> str:
    # `server_now` ticks on every resolution and carries no information the
    # client needs to react to - hashing it in would mean the signature
    # never repeats, defeating the whole point of diffing.
    context = {k: v for k, v in payload["context"].items() if k != "server_now"}
    signable = {**payload, "context": context}
    encoded = json.dumps(signable, default=str, sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@app.get("/api/dashboard/stream")
async def stream_summary(
    request: Request,
    date: Optional[date_cls] = Query(None),
    shift: Optional[str] = Query(None),
):
    """Server-sent events: re-pushes the dashboard summary only when it
    actually changes - either because an incident was written (near-instant,
    see libs.events) or because the operational_day/shift rolled over while
    idle (nothing writes at the exact moment a shift boundary passes, so
    that transition can only be caught by re-checking the clock). The
    periodic re-check itself is nearly free: it's pure datetime math with no
    Mongo query unless one of those two things actually happened, so an idle
    connection does not hit the database every tick."""
    _require_lookups()
    requested_shift = _parse_shift(shift)

    async def event_generator():
        last_signature: Optional[str] = None
        last_ctx_key: Optional[tuple] = None
        last_is_current = True
        wake_queue = events.subscribe()
        try:
            first = True
            while True:
                if await request.is_disconnected():
                    break

                woken_by_write = False
                if not first:
                    poll_interval = 2 if last_is_current else 20
                    try:
                        # Woken immediately by a same-process write (see
                        # libs.events); the timeout is the fallback that
                        # catches shift-boundary rollovers and covers a
                        # missed/cross-process wake-up.
                        await asyncio.wait_for(wake_queue.get(), timeout=poll_interval)
                        woken_by_write = True
                    except asyncio.TimeoutError:
                        pass

                ctx = resolve_context(date, requested_shift)
                ctx_key = (ctx.operational_day, ctx.shift)
                last_is_current = ctx.is_current

                if first or woken_by_write or ctx_key != last_ctx_key:
                    # pymongo is synchronous, so calling it straight from this
                    # `async def` generator blocked the whole event loop for the
                    # duration of the query - every other connection, and the
                    # response to the POST that triggered this rebuild, waited
                    # behind it. The threadpool keeps the loop free.
                    payload = await run_in_threadpool(aggregations.build_summary, ctx)
                    signature = _payload_signature(payload)

                    if signature != last_signature:
                        last_signature = signature
                        yield {"event": "dashboard", "data": _sse_data(payload)}

                    last_ctx_key = ctx_key

                first = False
        finally:
            events.unsubscribe(wake_queue)

    return EventSourceResponse(event_generator())


@app.get("/api/call-stats/summary")
async def get_call_stats(day: Optional[date_cls] = Query(None)):
    """Call-centre counters for one Bangkok calendar day (default: today).

    `day` is a date, not an epoch range: the browser must not do that
    arithmetic itself. Asia/Bangkok has never changed its UTC offset, so
    adding 86400 per day would in fact work today - but it bakes that into
    the frontend invisibly, and the backend already derives the window from
    the zone in one tested place (`day_epoch_window`).
    """
    if day is not None and day > call_stats.bangkok_calendar_day():
        raise HTTPException(status_code=400, detail="day cannot be in the future")
    return await call_stats.get_call_stats(day)


@app.get("/api/call-stats/stream")
async def stream_call_stats(request: Request):
    """Server-sent events for the call-stats widget.

    All the work happens in `libs.call_stats`'s single shared poll loop: this
    connection is just a queue it broadcasts to. Frames are only produced when
    the payload actually changes - including at Bangkok midnight, when the
    day rolls over and yesterday's numbers are replaced. An idle overnight
    connection therefore transfers nothing but sse-starlette's keepalive.
    """

    async def event_generator():
        queue = await call_stats.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    # The timeout does no work; it just returns control often
                    # enough to notice a client that has gone away.
                    payload = await asyncio.wait_for(queue.get(), timeout=5)
                except asyncio.TimeoutError:
                    continue
                yield {"event": "call-stats", "data": _sse_data(payload)}
        finally:
            call_stats.unsubscribe(queue)

    return EventSourceResponse(event_generator())


@app.get("/api/agents")
async def get_agents():
    """On-duty agents for the branch, with live status.

    No Mongo dependency for the status itself - the roster comes from the
    NIEMS feed and the database only supplies names, so this still answers
    during a database outage (with extensions in place of names).
    """
    return await agents.get_agents()


@app.get("/api/agents/stream")
async def stream_agents(request: Request):
    """Server-sent events for the agent board.

    Polled far more often than the call statistics - status flips the moment
    somebody answers a call - but through the same shared loop, so the number
    of upstream requests does not grow with the number of open boards.
    """

    async def event_generator():
        queue = await agents.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=5)
                except asyncio.TimeoutError:
                    continue
                yield {"event": "agents", "data": _sse_data(payload)}
        finally:
            agents.unsubscribe(queue)

    return EventSourceResponse(event_generator())


@app.get("/api/incident-history")
def get_incident_history(date: Optional[date_cls] = Query(None)):
    _require_lookups()
    ctx = resolve_day_context(date)
    return aggregations.build_incident_history(ctx.operational_day, ctx.is_current, ctx.server_now)


@app.get("/api/incident-history/stream")
async def stream_incident_history(request: Request, date: Optional[date_cls] = Query(None)):
    """Same wake-up/dedup mechanics as `stream_summary` above, but scoped to
    a whole operational day (no shift) - the frontend only opens this
    connection while viewing today, so `last_is_current` here is normally
    always true; the historical-day poll interval is kept anyway so a
    connection left open across a day rollover still behaves sanely."""
    _require_lookups()

    async def event_generator():
        last_signature: Optional[str] = None
        last_day: Optional[date_cls] = None
        last_is_current = True
        wake_queue = events.subscribe()
        try:
            first = True
            while True:
                if await request.is_disconnected():
                    break

                woken_by_write = False
                if not first:
                    poll_interval = 2 if last_is_current else 20
                    try:
                        await asyncio.wait_for(wake_queue.get(), timeout=poll_interval)
                        woken_by_write = True
                    except asyncio.TimeoutError:
                        pass

                ctx = resolve_day_context(date)
                last_is_current = ctx.is_current

                if first or woken_by_write or ctx.operational_day != last_day:
                    payload = await run_in_threadpool(
                        aggregations.build_incident_history, ctx.operational_day, ctx.is_current, ctx.server_now
                    )
                    signature = _payload_signature(payload)

                    if signature != last_signature:
                        last_signature = signature
                        yield {"event": "incident-history", "data": _sse_data(payload)}

                    last_day = ctx.operational_day

                first = False
        finally:
            events.unsubscribe(wake_queue)

    return EventSourceResponse(event_generator())


@app.post("/api/incidents")
def create_incident(body: IncidentCreateIn):
    """Always writes with the server's current timestamp - there is no way
    to backdate an incident, which is what keeps "only the current shift can
    save" true without needing a separate check here."""
    _require_lookups()
    call_id = lookups.resolve_call_id(body.call_type_code)
    if call_id is None:
        raise HTTPException(status_code=400, detail="unknown call_type_code")

    case_id = channel_id = cbd_id = severity_id = None

    if body.call_type_code == "NY":
        if not (body.reporting_channel_name and body.case_type_name and body.cbd_name and body.severity_name):
            raise HTTPException(status_code=400, detail="missing required fields for a new-call incident")

        channel_id = lookups.resolve_channel_id(body.reporting_channel_name)
        case_id = lookups.resolve_case_id(body.case_type_name)
        cbd_id = lookups.resolve_cbd_id(body.cbd_name)
        severity_id = lookups.resolve_severity_id(body.severity_name)

        if None in (channel_id, case_id, cbd_id, severity_id):
            raise HTTPException(status_code=400, detail="could not resolve one or more reference fields")

    now = now_local()
    incident_id = f"INC-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"

    db.incidents.insert_one(
        {
            "incident_id": incident_id,
            "timestamp": now,
            "hour": f"{now.hour:02d}",
            "call_id": call_id,
            "case_id": case_id,
            "cbd_id": cbd_id,
            "channel_id": channel_id,
            "severity_id": severity_id,
        }
    )
    events.notify_incidents_changed()

    return {
        "incident": {
            "incident_id": incident_id,
            "time": now.strftime("%H:%M:%S"),
            "call_type": lookups.call_name(call_id),
            "cbd": lookups.cbd_label(cbd_id),
            "severity": lookups.severity_name(severity_id),
        },
        "context": resolve_context(None, None).to_dict(),
    }
