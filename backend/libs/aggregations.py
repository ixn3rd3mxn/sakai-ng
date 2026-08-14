"""Mongo aggregation queries backing each dashboard widget.

Every query here is scoped through an `OperationalContext` (see
`libs.shift`) so the operational-day/shift boundaries are applied
consistently, instead of each widget filtering by calendar day.
"""

from __future__ import annotations

from datetime import timedelta

from libs import lookups
from libs.configs import db
from libs.shift import OperationalContext, SHIFT_ORDER, shift_window


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
