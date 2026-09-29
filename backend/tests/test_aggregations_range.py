"""Offline tests for the summary page's several-days / date-range view.

No database: `summarise_range` takes the incidents as plain dicts, and the
lookup tables are filled in directly. What is protected here:

- **Incidents are filed the way the one-day view files them.** The operational
  day rolls over at 08:30, so 02:00 on the 24th is the 23rd's night shift. A
  range that counted by calendar date would disagree with the day pages it
  is meant to add up.
- **Only the chosen days count.** Several separate days are fetched as
  separate windows, but a stray incident outside them must still not count.
- **A day with nothing on it is still a day.** It stays in the per-day list
  (the chart shows the gap) and in the average's divisor, but never in the
  top days.
"""

from __future__ import annotations

from datetime import date, datetime

from tests import helpers  # noqa: F401  (path + dummy MONGO_URI, must precede libs)

from libs import aggregations as agg
from libs import lookups


def setup() -> None:
    lookups._call_types.clear()
    lookups._call_types.update({1: "แจ้งเหตุ", 2: "สอบถาม"})
    lookups._reporting_channels.clear()
    lookups._reporting_channels.update({1: "1669"})
    lookups._case_types.clear()
    lookups._case_types.update({1: "อุบัติเหตุ"})
    lookups._severity_levels.clear()
    lookups._severity_levels.update({1: {"name": "แดง", "des": ""}})
    lookups._cbd_categories.clear()
    lookups._cbd_categories.update({1: {"name": "CBD1", "des": ""}})


def _incident(ts: datetime, call_id: int = 1, **fields) -> dict:
    return {"timestamp": ts, "call_id": call_id, **fields}


def _row(rows: list[dict], name: str) -> dict:
    return next(r for r in rows if r["name"] == name)


def test_night_after_midnight_belongs_to_the_previous_operational_day():
    setup()
    docs = [
        _incident(datetime(2026, 9, 23, 9, 0)),  # 23rd, morning
        _incident(datetime(2026, 9, 23, 17, 0)),  # 23rd, afternoon
        _incident(datetime(2026, 9, 24, 2, 0)),  # still the 23rd: night
        _incident(datetime(2026, 9, 24, 8, 29)),  # still the 23rd: night
        _incident(datetime(2026, 9, 24, 8, 30)),  # the 24th, morning
    ]
    result = agg.summarise_range(docs, [date(2026, 9, 23), date(2026, 9, 24)])
    assert result["per_day"] == [
        {"operational_day": "2026-09-23", "count": 4},
        {"operational_day": "2026-09-24", "count": 1},
    ]
    total = _row(result["statistics"]["call_type"], "ผลรวมทั้งหมด")
    assert (total["shift_morning"], total["shift_afternoon"], total["shift_night"]) == (2, 1, 2)
    assert total["total"] == 5


def test_only_the_chosen_days_count():
    setup()
    docs = [
        _incident(datetime(2026, 9, 23, 9, 0)),
        _incident(datetime(2026, 9, 24, 9, 0)),  # not asked for
        _incident(datetime(2026, 9, 25, 9, 0)),
    ]
    result = agg.summarise_range(docs, [date(2026, 9, 23), date(2026, 9, 25)])
    assert [d["operational_day"] for d in result["per_day"]] == ["2026-09-23", "2026-09-25"]
    assert _row(result["statistics"]["call_type"], "ผลรวมทั้งหมด")["total"] == 2


def test_an_empty_day_stays_in_the_list_and_the_average_but_not_the_top_days():
    setup()
    docs = [_incident(datetime(2026, 9, 23, 9, 0)) for _ in range(3)]
    result = agg.summarise_range(docs, [date(2026, 9, 23), date(2026, 9, 24)])
    assert result["per_day"][1] == {"operational_day": "2026-09-24", "count": 0}
    assert result["top_days"] == [{"operational_day": "2026-09-23", "count": 3}]
    assert _row(result["statistics"]["call_type"], "แจ้งเหตุ")["daily_average"] == 1.5


def test_every_lookup_value_is_listed_even_at_zero_and_only_call_type_has_a_total():
    setup()
    docs = [_incident(datetime(2026, 9, 23, 9, 0), call_id=1, channel_id=1)]
    stats = agg.summarise_range(docs, [date(2026, 9, 23)])["statistics"]
    assert [r["name"] for r in stats["call_type"]] == ["ผลรวมทั้งหมด", "แจ้งเหตุ", "สอบถาม"]
    assert _row(stats["call_type"], "สอบถาม")["total"] == 0
    assert [r["name"] for r in stats["reporting_channel"]] == ["1669"]
    assert stats["reporting_channel"][0]["total"] == 1
    # No case type on this incident: counted nowhere, not as zero-id.
    assert stats["case_type"][0]["total"] == 0


def test_consecutive_days_are_one_window_and_a_gap_starts_another():
    windows = agg._day_windows([date(2026, 9, 25), date(2026, 9, 23), date(2026, 9, 24), date(2026, 9, 27)])
    assert [(w.start, w.end) for w in windows] == [
        (datetime(2026, 9, 23, 8, 30), datetime(2026, 9, 26, 8, 30)),
        (datetime(2026, 9, 27, 8, 30), datetime(2026, 9, 28, 8, 30)),
    ]


# --- the dashboard board over several days ------------------------------------


def test_the_previous_period_is_the_same_span_just_before():
    assert agg.previous_days([date(2026, 9, 23), date(2026, 9, 24), date(2026, 9, 25)]) == [
        date(2026, 9, 20), date(2026, 9, 21), date(2026, 9, 22),
    ]
    # Separate days keep their spacing, moved back by the span they cover.
    assert agg.previous_days([date(2026, 9, 8), date(2026, 9, 17)]) == [date(2026, 8, 29), date(2026, 9, 7)]


def test_the_board_counts_the_days_and_diffs_against_the_period_before():
    setup()
    days = [date(2026, 9, 23), date(2026, 9, 24)]  # previous period: 21st and 22nd
    docs = [
        _incident(datetime(2026, 9, 23, 9, 0), call_id=1, severity_id=1, cbd_id=1, case_id=1, channel_id=1),
        _incident(datetime(2026, 9, 23, 17, 0), call_id=1),
        _incident(datetime(2026, 9, 25, 2, 0), call_id=2),  # the 24th's night
        _incident(datetime(2026, 9, 21, 9, 0), call_id=1),  # previous period
        _incident(datetime(2026, 9, 20, 9, 0), call_id=1),  # neither
    ]
    board = agg.summarise_board_range(docs, days)
    stats = board["incident_type_stats"]
    assert stats["total"] == {"count": 3, "diff": 2}
    assert {i["call_name"]: (i["count"], i["diff"]) for i in stats["items"]} == {"แจ้งเหตุ": (2, 1), "สอบถาม": (1, 1)}
    assert board["daily_summary"] == {"morning": 1, "afternoon": 1, "night": 1}
    assert board["per_day"] == [
        {"operational_day": "2026-09-23", "count": 2},
        {"operational_day": "2026-09-24", "count": 1},
    ]
    assert board["frequent_cbd"] == [{"cbd_id": 1, "cbd_name": "CBD1", "count": 1}]
    assert board["severity_stats"] == [{"severity_id": 1, "severity_name": "แดง", "count": 1}]
    assert board["incident_breakdowns"]["reporting_channel"] == [{"id": 1, "name": "1669", "count": 1}]
    assert board["recent_incidents"] == []


def test_an_empty_range_is_zeros_not_missing():
    setup()
    board = agg.summarise_board_range([], [date(2026, 9, 23)])
    assert board["incident_type_stats"]["total"] == {"count": 0, "diff": 0}
    assert all(item["count"] == 0 for item in board["incident_type_stats"]["items"])
    assert board["daily_summary"] == {"morning": 0, "afternoon": 0, "night": 0}
    assert board["frequent_cbd"] == []
