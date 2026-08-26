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
    Window,
    calendar_month_window,
    calendar_week_window,
    get_operational_day,
    operational_day_window,
    shift_window,
)


def _facet_count(facet_result: list[dict]) -> int:
    """$facet's $count sub-pipeline yields [] (not [{"count": 0}]) when
    nothing matches."""
    return facet_result[0]["count"] if facet_result else 0


def _facet_grouped(facet_result: list[dict]) -> dict[int, int]:
    return {doc["_id"]: doc["count"] for doc in facet_result}


def _shift_facet(ctx: OperationalContext, cbd_limit: int = 10, recent_limit: int = 200) -> dict:
    """Single round trip covering everything scoped to "this shift" plus
    "same shift, previous day" (for the diff): what used to be 7 sequential
    queries (incident_type_stats x4, severity_stats, frequent_cbd,
    recent_incidents) are all the same collection scan, just grouped/shaped
    differently, so one $facet aggregation replaces all of them. This
    matters a lot more than it would on a local Mongo, since BE and DB live
    in different regions - every round trip pays full network latency, and
    at ~10 sequential queries that added up to multiple seconds per page
    load."""
    prev_window = shift_window(ctx.operational_day - timedelta(days=1), ctx.shift)
    outer_start = min(ctx.window_start, prev_window.start)
    outer_end = max(ctx.window_end, prev_window.end)

    cur_match = {"timestamp": {"$gte": ctx.window_start, "$lt": ctx.window_end}}
    prev_match = {"timestamp": {"$gte": prev_window.start, "$lt": prev_window.end}}

    pipeline = [
        {"$match": {"timestamp": {"$gte": outer_start, "$lt": outer_end}}},
        {
            "$facet": {
                "total": [{"$match": cur_match}, {"$count": "count"}],
                "prev_total": [{"$match": prev_match}, {"$count": "count"}],
                "counts": [{"$match": cur_match}, {"$group": {"_id": "$call_id", "count": {"$sum": 1}}}],
                "prev_counts": [{"$match": prev_match}, {"$group": {"_id": "$call_id", "count": {"$sum": 1}}}],
                "severity": [
                    {"$match": {**cur_match, "severity_id": {"$ne": None}}},
                    {"$group": {"_id": "$severity_id", "count": {"$sum": 1}}},
                ],
                "cbd": [
                    {"$match": {**cur_match, "cbd_id": {"$ne": None}}},
                    {"$group": {"_id": "$cbd_id", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1, "_id": 1}},
                    {"$limit": cbd_limit},
                ],
                "recent": [{"$match": cur_match}, {"$sort": {"timestamp": -1}}, {"$limit": recent_limit}],
            }
        },
    ]
    return next(iter(db.incidents.aggregate(pipeline)), {})


def _incident_type_stats(facet: dict) -> dict:
    total = _facet_count(facet.get("total", []))
    prev_total = _facet_count(facet.get("prev_total", []))
    counts = _facet_grouped(facet.get("counts", []))
    prev_counts = _facet_grouped(facet.get("prev_counts", []))

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


def _severity_stats(facet: dict) -> list[dict]:
    counts = _facet_grouped(facet.get("severity", []))
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


def _frequent_cbd(facet: dict) -> list[dict]:
    items = []
    for doc in facet.get("cbd", []):
        cbd_id = doc["_id"]
        info = lookups.cbd_categories().get(cbd_id, {"name": f"CBD{cbd_id}"})
        items.append({"cbd_id": cbd_id, "cbd_name": info["name"], "count": doc["count"]})
    return items


def _recent_incidents(facet: dict) -> list[dict]:
    items = []
    for doc in facet.get("recent", []):
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


def _daily_summary(ctx: OperationalContext) -> dict:
    """Per-shift totals across the whole selected operational day - one
    round trip (via $facet) instead of three."""
    day_window = operational_day_window(ctx.operational_day)
    windows = {shift: shift_window(ctx.operational_day, shift) for shift in SHIFT_ORDER}

    pipeline = [
        {"$match": {"timestamp": {"$gte": day_window.start, "$lt": day_window.end}}},
        {
            "$facet": {
                shift: [{"$match": {"timestamp": {"$gte": w.start, "$lt": w.end}}}, {"$count": "count"}]
                for shift, w in windows.items()
            }
        },
    ]
    result = next(iter(db.incidents.aggregate(pipeline)), {})
    return {shift: _facet_count(result.get(shift, [])) for shift in SHIFT_ORDER}


def build_summary(ctx: OperationalContext) -> dict:
    facet = _shift_facet(ctx)
    return {
        "context": ctx.to_dict(),
        "incident_type_stats": _incident_type_stats(facet),
        "daily_summary": _daily_summary(ctx),
        "severity_stats": _severity_stats(facet),
        "frequent_cbd": _frequent_cbd(facet),
        "recent_incidents": _recent_incidents(facet),
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


def _dimension_windows(operational_day: date) -> dict[str, Window]:
    return {
        "shift_morning": shift_window(operational_day, "morning"),
        "shift_afternoon": shift_window(operational_day, "afternoon"),
        "shift_night": shift_window(operational_day, "night"),
        "daily": operational_day_window(operational_day),
        "weekly": calendar_week_window(operational_day),
        "monthly": calendar_month_window(operational_day),
    }


def _all_dimension_counts(operational_day: date) -> dict[str, dict[int, int]]:
    """One round trip covering every (dimension, window) combination the
    incident-history page needs. This used to be 30 sequential queries (5
    dimensions x 6 windows via `_grouped_counts`) - each paying full network
    latency to Mongo - collapsed into a single $facet aggregation with one
    branch per combination."""
    windows = _dimension_windows(operational_day)
    outer_start = min(w.start for w in windows.values())
    outer_end = max(w.end for w in windows.values())

    facets = {}
    for dimension, field in _DIMENSION_FIELD.items():
        for window_key, w in windows.items():
            facets[f"{dimension}__{window_key}"] = [
                {"$match": {"timestamp": {"$gte": w.start, "$lt": w.end}, field: {"$ne": None}}},
                {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            ]

    pipeline = [
        {"$match": {"timestamp": {"$gte": outer_start, "$lt": outer_end}}},
        {"$facet": facets},
    ]
    result = next(iter(db.incidents.aggregate(pipeline)), {})
    return {key: _facet_grouped(value) for key, value in result.items()}


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


def dimension_statistics(dimension: DimensionKey, all_counts: dict[str, dict[int, int]]) -> list[dict]:
    """Shift/daily/weekly/monthly counts for every value of `dimension`,
    shaped from the single consolidated query in `_all_dimension_counts`.

    shift_morning/afternoon/night are the three shift windows of the
    operational day; daily/weekly/monthly are the operational day, the
    calendar week containing it, and the calendar month containing it - not
    scoped to any one shift, matching the stat tables on the incident
    history page where each row combines all shifts for those columns.
    """
    names = _dimension_lookup(dimension)
    counts_by_key = {key: all_counts.get(f"{dimension}__{key}", {}) for key in _STAT_KEYS}

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
    all_counts = _all_dimension_counts(operational_day)
    return {
        "context": {
            "operational_day": operational_day.isoformat(),
            "is_current": is_current,
            "server_now": server_now.isoformat(),
        },
        "incidents": incident_history_list(operational_day),
        "statistics": {
            "call_type": dimension_statistics("call_type", all_counts),
            "reporting_channel": dimension_statistics("reporting_channel", all_counts),
            "case_type": dimension_statistics("case_type", all_counts),
            "severity": dimension_statistics("severity", all_counts),
            "cbd": dimension_statistics("cbd", all_counts),
        },
        "top_days": top_days_in_month(operational_day),
    }
