"""Mongo aggregation queries backing each dashboard widget.

Every query here is scoped through an `OperationalContext` (see
`libs.shift`) so the operational-day/shift boundaries are applied
consistently, instead of each widget filtering by calendar day.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from libs import lookups
from libs.configs import db
from libs.shift import (
    OperationalContext,
    SHIFT_ORDER,
    calendar_month_window,
    calendar_week_window,
    get_operational_day,
    operational_day_window,
    shift_window,
)


def _count_in_window(start, end, extra: dict | None = None) -> int:
    query: dict = {"timestamp": {"$gte": start, "$lt": end}}
    if extra:
        query.update(extra)
    return db.incidents.count_documents(query)


def incident_type_stats(ctx: OperationalContext) -> dict:
    """Total + per-call-type counts for the shift, each compared against the
    same shift on the previous operational day."""
    prev_window = shift_window(ctx.operational_day - timedelta(days=1), ctx.shift)

    total = _count_in_window(ctx.window_start, ctx.window_end)
    prev_total = _count_in_window(prev_window.start, prev_window.end)

    counts = {
        doc["_id"]: doc["count"]
        for doc in db.incidents.aggregate(
            [
                {"$match": {"timestamp": {"$gte": ctx.window_start, "$lt": ctx.window_end}}},
                {"$group": {"_id": "$call_id", "count": {"$sum": 1}}},
            ]
        )
    }
    prev_counts = {
        doc["_id"]: doc["count"]
        for doc in db.incidents.aggregate(
            [
                {"$match": {"timestamp": {"$gte": prev_window.start, "$lt": prev_window.end}}},
                {"$group": {"_id": "$call_id", "count": {"$sum": 1}}},
            ]
        )
    }

    items = []
    for call_id, name in sorted(lookups.call_types().items()):
        count = counts.get(call_id, 0)
        prev = prev_counts.get(call_id, 0)
        items.append(
            {
                "call_id": call_id,
                "call_name": name,
                "count": count,
                "diff": count - prev,
            }
        )

    return {
        "total": {"count": total, "diff": total - prev_total},
        "items": items,
    }


def daily_summary(ctx: OperationalContext) -> dict:
    """Per-shift totals across the whole selected operational day."""
    result = {}
    for shift in SHIFT_ORDER:
        window = shift_window(ctx.operational_day, shift)
        result[shift] = _count_in_window(window.start, window.end)
    return result


def severity_stats(ctx: OperationalContext) -> list[dict]:
    counts = {
        doc["_id"]: doc["count"]
        for doc in db.incidents.aggregate(
            [
                {
                    "$match": {
                        "timestamp": {"$gte": ctx.window_start, "$lt": ctx.window_end},
                        "severity_id": {"$ne": None},
                    }
                },
                {"$group": {"_id": "$severity_id", "count": {"$sum": 1}}},
            ]
        )
    }

    items = []
    for severity_id, info in sorted(lookups.severity_levels().items()):
        items.append(
            {
                "severity_id": severity_id,
                "severity_name": info["name"],
                "count": counts.get(severity_id, 0),
            }
        )
    return items


def frequent_cbd(ctx: OperationalContext, limit: int = 10) -> list[dict]:
    pipeline = [
        {
            "$match": {
                "timestamp": {"$gte": ctx.window_start, "$lt": ctx.window_end},
                "cbd_id": {"$ne": None},
            }
        },
        {"$group": {"_id": "$cbd_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
        {"$limit": limit},
    ]

    items = []
    for doc in db.incidents.aggregate(pipeline):
        cbd_id = doc["_id"]
        info = lookups.cbd_categories().get(cbd_id, {"name": f"CBD{cbd_id}"})
        items.append({"cbd_id": cbd_id, "cbd_name": info["name"], "count": doc["count"]})
    return items


def recent_incidents(ctx: OperationalContext, limit: int = 200) -> list[dict]:
    cursor = (
        db.incidents.find({"timestamp": {"$gte": ctx.window_start, "$lt": ctx.window_end}})
        .sort("timestamp", -1)
        .limit(limit)
    )

    items = []
    for doc in cursor:
        ts = doc["timestamp"]
        items.append(
            {
                "incident_id": doc.get("incident_id", str(doc["_id"])),
                "time": ts.strftime("%H:%M:%S"),
                "timestamp": ts.isoformat(),
                "call_type": lookups.call_name(doc.get("call_id")),
                "cbd": lookups.cbd_label(doc.get("cbd_id")),
                "severity": lookups.severity_name(doc.get("severity_id")),
            }
        )
    return items


def build_summary(ctx: OperationalContext) -> dict:
    return {
        "context": ctx.to_dict(),
        "incident_type_stats": incident_type_stats(ctx),
        "daily_summary": daily_summary(ctx),
        "severity_stats": severity_stats(ctx),
        "frequent_cbd": frequent_cbd(ctx),
        "recent_incidents": recent_incidents(ctx),
    }


# ---- incident history / summary page ----------------------------------

DimensionKey = Literal["call_type", "reporting_channel", "case_type", "severity", "cbd"]

_DIMENSION_FIELD: dict[DimensionKey, str] = {
    "call_type": "call_id",
    "reporting_channel": "channel_id",
    "case_type": "case_id",
    "severity": "severity_id",
    "cbd": "cbd_id",
}

_STAT_KEYS = ("shift_morning", "shift_afternoon", "shift_night", "daily", "weekly", "monthly")


def _grouped_counts(field: str, start: datetime, end: datetime) -> dict[int, int]:
    return {
        doc["_id"]: doc["count"]
        for doc in db.incidents.aggregate(
            [
                {"$match": {"timestamp": {"$gte": start, "$lt": end}, field: {"$ne": None}}},
                {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            ]
        )
    }


def _dimension_lookup(dimension: DimensionKey) -> dict[int, str]:
    if dimension == "call_type":
        return lookups.call_types()
    if dimension == "reporting_channel":
        return lookups.reporting_channels()
    if dimension == "case_type":
        return lookups.case_types()
    if dimension == "severity":
        return {k: v["name"] for k, v in lookups.severity_levels().items()}
    if dimension == "cbd":
        return {k: f"{v['name']} {v['des']}".strip() for k, v in lookups.cbd_categories().items()}
    raise ValueError(f"unknown dimension: {dimension!r}")  # pragma: no cover - Literal guards this


def dimension_statistics(dimension: DimensionKey, operational_day: date) -> list[dict]:
    """Shift/daily/weekly/monthly counts for every value of `dimension`.

    shift_morning/afternoon/night are the three shift windows of
    `operational_day` itself; daily/weekly/monthly are the operational day,
    the calendar week containing it, and the calendar month containing it -
    not scoped to any one shift, matching the stat tables on the incident
    history page where each row combines all shifts for those columns.
    """
    field = _DIMENSION_FIELD[dimension]
    names = _dimension_lookup(dimension)

    morning = shift_window(operational_day, "morning")
    afternoon = shift_window(operational_day, "afternoon")
    night = shift_window(operational_day, "night")
    day_window = operational_day_window(operational_day)
    week_window = calendar_week_window(operational_day)
    month_window = calendar_month_window(operational_day)

    counts_by_key = {
        "shift_morning": _grouped_counts(field, morning.start, morning.end),
        "shift_afternoon": _grouped_counts(field, afternoon.start, afternoon.end),
        "shift_night": _grouped_counts(field, night.start, night.end),
        "daily": _grouped_counts(field, day_window.start, day_window.end),
        "weekly": _grouped_counts(field, week_window.start, week_window.end),
        "monthly": _grouped_counts(field, month_window.start, month_window.end),
    }

    items = []
    for id_, name in sorted(names.items()):
        items.append({"name": name, **{key: counts_by_key[key].get(id_, 0) for key in _STAT_KEYS}})

    if dimension == "call_type":
        total = {"name": "ผลรวมทั้งหมด", **{key: sum(item[key] for item in items) for key in _STAT_KEYS}}
        items.insert(0, total)

    return items


def top_days_in_month(operational_day: date, limit: int = 5) -> list[dict]:
    """Top `limit` operational days (08:30 cutover, not calendar midnight -
    see libs.shift) by incident count, within the calendar month containing
    `operational_day`."""
    window = calendar_month_window(operational_day)
    cursor = db.incidents.find({"timestamp": {"$gte": window.start, "$lt": window.end}}, {"timestamp": 1, "_id": 0})

    counts: dict[date, int] = {}
    for doc in cursor:
        day = get_operational_day(doc["timestamp"])
        counts[day] = counts.get(day, 0) + 1

    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [{"operational_day": day.isoformat(), "count": count} for day, count in ranked]


def incident_history_list(operational_day: date) -> list[dict]:
    """Every incident recorded on `operational_day`, oldest first."""
    window = operational_day_window(operational_day)
    cursor = db.incidents.find({"timestamp": {"$gte": window.start, "$lt": window.end}}).sort("timestamp", 1)

    items = []
    for doc in cursor:
        ts = doc["timestamp"]
        items.append(
            {
                "incident_id": doc.get("incident_id", str(doc["_id"])),
                "time": ts.strftime("%H:%M:%S"),
                "hour": doc.get("hour", ts.strftime("%H")),
                "call_type": lookups.call_name(doc.get("call_id")),
                "reporting_channel": lookups.channel_name(doc.get("channel_id")),
                "case_type": lookups.case_name(doc.get("case_id")),
                "cbd": lookups.cbd_name(doc.get("cbd_id")),
                "severity": lookups.severity_name(doc.get("severity_id")),
            }
        )
    return items


def build_incident_history(operational_day: date, is_current: bool, server_now: datetime) -> dict:
    return {
        "context": {
            "operational_day": operational_day.isoformat(),
            "is_current": is_current,
            "server_now": server_now.isoformat(),
        },
        "incidents": incident_history_list(operational_day),
        "statistics": {
            "call_type": dimension_statistics("call_type", operational_day),
            "reporting_channel": dimension_statistics("reporting_channel", operational_day),
            "case_type": dimension_statistics("case_type", operational_day),
            "severity": dimension_statistics("severity", operational_day),
            "cbd": dimension_statistics("cbd", operational_day),
        },
        "top_days": top_days_in_month(operational_day),
    }
