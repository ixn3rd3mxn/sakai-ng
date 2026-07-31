import asyncio
from datetime import datetime
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from libs.configs import (
    shiftwork_collection,
    incident_collection,
    cbdcriteria_collection,
    cbdlevel_collection,
)
from libs.models import Incident

_subscribers: set[asyncio.Queue] = set()


async def _broadcast(event: str) -> None:
    for q in list(_subscribers):
        await q.put(event)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/events")
async def events():
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)
    async def stream():
        try:
            while True:
                event = await q.get()
                yield {"event": event, "data": ""}
        except asyncio.CancelledError:
            _subscribers.discard(q)
    return EventSourceResponse(stream())


@app.get("/cbdcriteria")
def get_cbdcriteria():
    data = list(cbdcriteria_collection.find({}, {"_id": 0}).sort("cbdcriteria_id", 1))
    return data


@app.get("/cbdlevel")
def get_cbdlevel():
    data = list(cbdlevel_collection.find({}, {"_id": 0}).sort("cbdlevel_id", 1))
    return data


@app.get("/shiftwork")
def get_shiftwork():
    data = list(shiftwork_collection.find({}, {"_id": 0}))
    return data


@app.post("/incident")
async def create_incident(incident: Incident):
    now = datetime.now()
    saved_at = f"{now.hour:02d}:{now.minute:02d}:{now.second:02d}"
    data = incident.model_dump()
    data["saved_at"] = saved_at
    incident_collection.insert_one(data)
    await _broadcast("incident_created")
    return {"message": "ok", "saved_at": saved_at}


@app.get("/incident/summary")
def get_incident_summary(
    date: str = Query(...),
    shift_id: int = Query(...),
):
    query = {"date": date, "shift_id": shift_id}
    incidents = list(incident_collection.find(query, {"_id": 0}))

    summary = {
        "total": len(incidents),
        "แจ้งเหตุ": {
            "total": 0,
            "1669": 0,
            "2nd": 0,
            "วิทยุ": 0,
            "trauma": 0,
            "non_trauma": 0,
        },
        "แจ้งเพิ่มเติม เหตุเดียวกัน": 0,
        "ปรึกษา": 0,
        "สายหลุด": 0,
        "ก่อกวน": 0,
    }

    for inc in incidents:
        t = inc.get("type", "")
        if t == "แจ้งเหตุ":
            summary["แจ้งเหตุ"]["total"] += 1
            subtype = inc.get("subtype", "")
            if subtype in ("1669", "2nd", "วิทยุ"):
                summary["แจ้งเหตุ"][subtype] += 1
            level = inc.get("level", "")
            if level == "trauma":
                summary["แจ้งเหตุ"]["trauma"] += 1
            elif level == "non-trauma":
                summary["แจ้งเหตุ"]["non_trauma"] += 1
        elif t == "แจ้งเพิ่มเติม เหตุเดียวกัน":
            summary["แจ้งเพิ่มเติม เหตุเดียวกัน"] += 1
        elif t == "ปรึกษา":
            summary["ปรึกษา"] += 1
        elif t == "สายหลุด":
            summary["สายหลุด"] += 1
        elif t == "ก่อกวน":
            summary["ก่อกวน"] += 1

    return summary


@app.get("/incident/list")
def get_incident_list(
    date: str = Query(...),
    shift_id: int = Query(...),
):
    query = {"date": date, "shift_id": shift_id}
    incidents = list(incident_collection.find(query, {"_id": 0}))
    return incidents


