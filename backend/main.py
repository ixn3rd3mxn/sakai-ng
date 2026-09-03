from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date as date_cls
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from libs import agents, aggregations, call_log, call_stats, events, feed_health, lookups, relay
from libs import flood_cases, flood_events, flood_lookups
from libs.configs import CORS_ORIGINS, db
from libs.models import (
    FloodCaseBulkStatusIn,
    FloodCaseCreateIn,
    FloodCaseStatusIn,
    FloodCaseUpdateIn,
    IncidentCreateIn,
)
from libs.shift import SHIFT_LABELS, Shift, now_local, resolve_context, resolve_day_context


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


async def _load_flood_areas_forever() -> None:
    """Keep retrying the flood area cache until it succeeds, then build the
    `flood_cases` indexes.

    Never awaited during startup, unlike `lookups.load()` above. That one is
    given a bounded first attempt because the three EMS report pages cannot
    serve without it; this one backs a page that did not exist last week, and
    letting it delay startup - or worse, raise into it - would mean a problem
    with flood master data taking the dashboards offline. It retries in the
    background for as long as the process lives instead.
    """
    delay = 2
    while True:
        try:
            await run_in_threadpool(flood_lookups.load)
            logger.info("flood area master data loaded")
            break
        except PyMongoError as exc:
            logger.warning("could not load flood area master data (%s); retrying in %ss", exc, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)

    try:
        await run_in_threadpool(flood_cases.ensure_indexes)
    except PyMongoError as exc:
        # Idempotent and retried on the next boot; the collection still reads
        # correctly without them, just more slowly. Not worth a crash loop.
        logger.warning("could not create flood_cases indexes (%s)", exc)


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

    # Always backgrounded, never awaited - see `_load_flood_areas_forever`.
    flood_task = asyncio.create_task(_load_flood_areas_forever())

    yield

    flood_task.cancel()
    if retry_task is not None:
        retry_task.cancel()
    await call_stats.aclose()
    await agents.aclose()
    await call_log.aclose()


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
    """Liveness for this service, plus what the upstream feeds are saying.

    A degraded upstream deliberately does **not** turn this into a 503. This
    endpoint doubles as the platform's liveness probe, and answering 503
    because a third party began serving stale numbers would have the container
    restarted - repeatedly and pointlessly, since a restart cannot fix
    somebody else's API, and every one of them drops all the open SSE boards.
    Mongo keeps its 503 because that genuinely is this process being unable to
    do its job.

    The upstream verdict travels in the body instead, next to the log lines
    `libs.feed_health` emits on each transition. `status` is "degraded" when
    anything is standing, and `upstream.trusted` is false only when the data
    is contradicted rather than merely suspect.
    """
    try:
        db.command("ping")
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}") from exc
    upstream = feed_health.snapshot()
    return {
        "status": "ok" if upstream["ok"] else "degraded",
        "database": "connected",
        "upstream": upstream,
    }


@app.get("/api/health/upstreams")
async def health_upstreams():
    """Can this process actually reach NIEMS right now, and how?

    Separate from `/api/health` because it is not a liveness probe: it makes
    a real request over the same path the feeds use, relay included, so it
    costs an upstream round trip and must never be on a restart-triggering
    endpoint.

    It exists because the two ways this breaks look identical from the board
    - every card blank - but have very different fixes:

      * `blocked` - the connect timed out. NIEMS accepts Thai addresses only
        and drops everything else silently, so this is the shape of running
        with no relay configured on foreign hosting. Set NIEMS_RELAY_URL and
        NIEMS_RELAY_TOKEN.
      * `bad_token` - the relay itself rejected us. One env var, one minute.
        Only relay.php sends `X-Relay-Error`, so this can never be confused
        with a 403 from NIEMS.

    Always 200: the verdict is the payload, and a monitor reading it wants
    the reason, not a status code.
    """
    target, params, headers = relay.route(call_stats.LIVE_URL, None)
    result = {
        "relay": relay.describe(),
        "upstream": call_stats.LIVE_URL,
        "via": target if relay.enabled() else "direct",
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(target, params=params, headers=headers)
    except httpx.ConnectTimeout as exc:
        return {
            **result,
            "reachable": False,
            "reason": "blocked",
            "detail": (
                "connect timed out; NIEMS accepts Thai IPs only and drops the rest silently. "
                f"Configure the relay, or host this backend in Thailand. ({type(exc).__name__})"
            ),
        }
    except httpx.HTTPError as exc:
        return {**result, "reachable": False, "reason": "transport_error", "detail": f"{type(exc).__name__}: {exc}"}

    relay_error = response.headers.get(relay.ERROR_HEADER)
    if relay_error:
        detail = f"the relay refused this request ({relay_error}): {response.text[:200]}"
        if relay_error == "bad_token":
            detail = "the relay refused this request: NIEMS_RELAY_TOKEN does not match RELAY_TOKEN on the relay host"
        return {**result, "reachable": False, "reason": relay_error, "status": response.status_code, "detail": detail}

    return {
        **result,
        "reachable": response.status_code < 500,
        "reason": "ok" if response.status_code < 400 else "upstream_error",
        "status": response.status_code,
    }


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


@app.get("/api/call-log")
async def get_call_log():
    """Answered calls and abandoned callers for today, in one payload.

    Mongo supplies only the agent names, so this still answers during a
    database outage - with extensions in place of names, as the agent board
    does.
    """
    return await call_log.get_call_log()


@app.get("/api/call-log/stream")
async def stream_call_log(request: Request):
    """Server-sent events for the two log tables.

    Polled far more slowly than the agent board: these are logs rather than
    live status, and the abandoned-call feed takes seconds to answer. One
    shared loop serves both tables and every open board.
    """

    async def event_generator():
        queue = await call_log.subscribe()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=5)
                except asyncio.TimeoutError:
                    continue
                yield {"event": "call-log", "data": _sse_data(payload)}
        finally:
            call_log.unsubscribe(queue)

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


# ---------------------------------------------------------------------------
# Flood-response intake
#
# Appended below every EMS endpoint and sharing none of their state: a
# separate lookup cache (`flood_lookups`), a separate SSE wake-up bus
# (`flood_events`), and a separate collection. `_require_lookups` is
# deliberately *not* called by anything here, so the two features cannot take
# each other down.
#
# Route order matters: FastAPI matches in declaration order, so every fixed
# path below has to be declared before `/api/flood-cases/{case_id}` or that
# parameterised route would swallow "stream", "export" and the rest.
# ---------------------------------------------------------------------------


def _require_flood_lookups() -> None:
    """Refuse to serve area-backed data before the flood cache is populated.

    Its own check, mirroring `_require_lookups` but reading a different flag.
    Without it an unloaded cache does not raise - it just rejects every amphoe
    as unknown, which reads to the operator as "the master data is wrong"
    rather than "the database is not up yet".
    """
    if not flood_lookups.loaded():
        raise HTTPException(status_code=503, detail="ข้อมูลพื้นที่ยังไม่พร้อม (ยังเชื่อมต่อฐานข้อมูลไม่ได้)")


def _flood_filters(
    tab: Optional[str],
    date_from: Optional[date_cls],
    date_to: Optional[date_cls],
    district_code: Optional[str],
    shift: Optional[str],
    agent_name: Optional[str],
    status: Optional[str],
    search: Optional[str],
    limit: int,
    offset: int,
) -> flood_cases.CaseFilters:
    return flood_cases.CaseFilters(
        tab=tab or flood_cases.TAB_ALL,
        date_from=date_from,
        date_to=date_to,
        district_code=district_code,
        shift=shift,
        agent_name=agent_name,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )


@app.get("/api/flood-lookups")
def get_flood_lookups():
    """Districts, subdistricts and the operator roster in one response.

    One payload rather than three endpoints because the whole set is tiny (12
    + 115 + 19 rows) and the amphoe/tambon dependency has to resolve without a
    round trip: the operator picks both while still on the call, and a request
    per amphoe change would be felt.

    The roster is read straight from `agents` - the same collection the agent
    board uses - and never written to. Names come back exactly as stored,
    without an honorific: the flood spreadsheet wrote "นางเจะรอฮานี วันหวัง"
    where `agents` holds "เจะรอฮานี วันหวัง", and inventing the prefix here
    would mean writing to a collection another page owns.
    """
    _require_flood_lookups()

    try:
        roster = [
            {"agent_name": doc["agent_name"], "agent_extension": str(doc.get("agent_extension") or "")}
            for doc in db.agents.find({}, {"agent_name": 1, "agent_extension": 1, "_id": 0})
            if doc.get("agent_name")
        ]
        roster.sort(key=lambda a: a["agent_name"])
    except PyMongoError:
        # The roster is a convenience - the field is free text on the form
        # anyway - so losing it must not cost the operator the area lists.
        roster = []

    return {
        "districts": flood_lookups.districts(),
        "subdistricts": flood_lookups.subdistricts(),
        "agents": roster,
        "channels": [{"code": k, "label": v} for k, v in flood_cases.CHANNEL_LABELS.items()],
        "genders": [{"code": k, "label": v} for k, v in flood_cases.GENDER_LABELS.items()],
        "statuses": [{"code": k, "label": v} for k, v in flood_cases.STATUS_LABELS.items()],
        "shifts": [{"code": k, "label": v} for k, v in SHIFT_LABELS.items()],
        "reporter_shortcuts": list(flood_cases.REPORTER_SHORTCUTS),
    }


@app.get("/api/flood-cases")
def get_flood_cases(
    tab: Optional[str] = Query(None),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    district_code: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(flood_cases.DEFAULT_LIMIT),
    offset: int = Query(0),
):
    filters = _flood_filters(
        tab, date_from, date_to, district_code, shift, agent_name, status, search, limit, offset
    )
    try:
        return flood_cases.list_cases(filters)
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/flood-cases/stream")
async def stream_flood_cases(
    request: Request,
    tab: Optional[str] = Query(None),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    district_code: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(flood_cases.DEFAULT_LIMIT),
    offset: int = Query(0),
):
    """Server-sent events for the case table.

    The reason this is not optional: several operators take calls at once, and
    the duplicate check only works if each of them can see what the others
    just wrote. A table that refreshes on a timer would leave a window in
    which two people both accept the same flooded house.

    Same signature-and-dedup mechanics as `stream_incident_history` - a frame
    only when the payload actually changed, with a poll timeout as the
    fallback that also catches the 08:30 shift rollover. Woken through
    `flood_events`, never `events`, so writing a flood case does not make the
    three EMS report pages rebuild their aggregations.
    """
    filters = _flood_filters(
        tab, date_from, date_to, district_code, shift, agent_name, status, search, limit, offset
    )

    async def event_generator():
        last_signature: Optional[str] = None
        wake_queue = flood_events.subscribe()
        try:
            first = True
            while True:
                if await request.is_disconnected():
                    break

                if not first:
                    try:
                        # Woken immediately by a same-process write; the
                        # timeout covers a cross-process write and the shift
                        # rollover, neither of which produces a wake-up here.
                        await asyncio.wait_for(wake_queue.get(), timeout=5)
                    except asyncio.TimeoutError:
                        pass

                # pymongo is synchronous: called straight from this async
                # generator it would block the event loop - and with it every
                # other connection - for the duration of the query.
                payload = await run_in_threadpool(flood_cases.list_cases, filters)
                signature = _payload_signature(payload)

                if signature != last_signature:
                    last_signature = signature
                    yield {"event": "flood-cases", "data": _sse_data(payload)}

                first = False
        finally:
            flood_events.unsubscribe(wake_queue)

    return EventSourceResponse(event_generator())


@app.get("/api/flood-cases/export")
def export_flood_cases(
    tab: Optional[str] = Query(None),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    district_code: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """The rows currently on screen, as CSV.

    Takes the same filter parameters as the table so the file matches what the
    operator is looking at - exporting everything when the screen shows one
    amphoe is the kind of mismatch that gets noticed only after the file has
    been sent on.
    """
    filters = _flood_filters(
        tab, date_from, date_to, district_code, shift, agent_name, status, search,
        flood_cases.MAX_LIMIT, 0,
    )
    try:
        body = flood_cases.export_csv(filters)
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Excel on Windows reads a BOM-less UTF-8 CSV as the system codepage and
    # renders every Thai column as mojibake; the BOM is what makes a
    # double-click work.
    return Response(
        content="﻿" + body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="' + flood_cases.export_filename() + '"'},
    )


@app.get("/api/flood-cases/duplicate-check")
def check_flood_duplicates(
    phone: Optional[str] = Query(None),
    subdistrict_code: Optional[str] = Query(None),
    location_note: Optional[str] = Query(None),
    exclude: Optional[str] = Query(None),
):
    """Recent cases that may be the same incident as the one being typed.

    Advisory only - it never blocks a save. Called on a debounce while the
    operator is still on the phone, so it stays a couple of indexed range
    queries and nothing else.
    """
    matches = flood_cases.find_duplicates(
        phone=phone,
        subdistrict_code=subdistrict_code,
        location_note=location_note,
        exclude_case_id=exclude,
    )
    return {"matches": matches, "window_hours": flood_cases.DUPLICATE_WINDOW_HOURS}


@app.post("/api/flood-cases/bulk-status")
def bulk_update_flood_status(body: FloodCaseBulkStatusIn):
    _require_flood_lookups()
    try:
        updated = flood_cases.bulk_set_status(body.case_ids, body.status)
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if updated:
        flood_events.notify_flood_cases_changed()
    return {"updated": updated}


@app.post("/api/flood-cases")
def create_flood_case(body: FloodCaseCreateIn):
    """Record one request for help.

    Requires the area cache, because the amphoe/tambon pair is resolved and
    validated server-side - the client filters its own dropdown, but the
    client is not what decides what gets stored.
    """
    _require_flood_lookups()
    try:
        case = flood_cases.insert_case(body.model_dump())
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    flood_events.notify_flood_cases_changed()
    return {"case": case}


@app.get("/api/flood-cases/{case_id}")
def get_flood_case(case_id: str):
    case = flood_cases.get_case(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="ไม่พบเคสนี้")
    return {"case": case}


@app.patch("/api/flood-cases/{case_id}")
def update_flood_case(case_id: str, body: FloodCaseUpdateIn):
    _require_flood_lookups()
    try:
        case = flood_cases.apply_update(case_id, body.model_dump())
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if case is None:
        raise HTTPException(status_code=404, detail="ไม่พบเคสนี้")

    flood_events.notify_flood_cases_changed()
    return {"case": case}


@app.patch("/api/flood-cases/{case_id}/status")
def update_flood_case_status(case_id: str, body: FloodCaseStatusIn):
    """Mark one case finished (or not) without sending the other eighteen
    fields - the action the table's row button performs, and by far the most
    frequent one on the page."""
    try:
        case = flood_cases.set_status(case_id, body.status)
    except flood_cases.FloodCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if case is None:
        raise HTTPException(status_code=404, detail="ไม่พบเคสนี้")

    flood_events.notify_flood_cases_changed()
    return {"case": case}
