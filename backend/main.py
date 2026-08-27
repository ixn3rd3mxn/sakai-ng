from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from contextlib import asynccontextmanager
from datetime import date as date_cls
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError
from sse_starlette.sse import EventSourceResponse
from starlette.concurrency import run_in_threadpool

from libs import aggregations, events, lookups
from libs.configs import CORS_ORIGINS, db
from libs.models import IncidentCreateIn
from libs.shift import Shift, now_local, resolve_context, resolve_day_context


@asynccontextmanager
async def lifespan(app: FastAPI):
    lookups.load()
    yield


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


@app.get("/api/incident-history")
def get_incident_history(date: Optional[date_cls] = Query(None)):
    ctx = resolve_day_context(date)
    return aggregations.build_incident_history(ctx.operational_day, ctx.is_current, ctx.server_now)


@app.get("/api/incident-history/stream")
async def stream_incident_history(request: Request, date: Optional[date_cls] = Query(None)):
    """Same wake-up/dedup mechanics as `stream_summary` above, but scoped to
    a whole operational day (no shift) - the frontend only opens this
    connection while viewing today, so `last_is_current` here is normally
    always true; the historical-day poll interval is kept anyway so a
    connection left open across a day rollover still behaves sanely."""
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
