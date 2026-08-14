"""Single source of truth for operational-day / shift / team logic.

The dispatch center does not report on the normal calendar day. Instead the
"operational day" starts at 08:30:00 and is split into three shifts, run by
two teams:

    Operational Day D
    ├── Morning:   D 08:30:00 -> D 16:29:59   (Morning team)
    └── Afternoon: D 16:30:00 -> D+1 00:29:59  (Afternoon/Night team)
        Night:     D+1 00:30:00 -> D+1 08:29:59 (Afternoon/Night team)

Every endpoint and the SSE stream must resolve date/shift/team through the
helpers below rather than re-deriving this logic themselves.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Literal, Optional

Shift = Literal["morning", "afternoon", "night"]
Team = Literal["morning", "afternoon_night"]

MORNING_START = time(8, 30, 0)
AFTERNOON_START = time(16, 30, 0)
NIGHT_START = time(0, 30, 0)

SHIFT_LABELS: dict[Shift, str] = {
    "morning": "เช้า",
    "afternoon": "บ่าย",
    "night": "ดึก",
}

TEAM_LABELS: dict[Team, str] = {
    "morning": "ทีมเช้า",
    "afternoon_night": "ทีมบ่าย-ดึก",
}

SHIFT_ORDER: tuple[Shift, ...] = ("morning", "afternoon", "night")


def get_shift(dt: datetime) -> Shift:
    """Shift is determined purely by wall-clock time of day."""
    t = dt.time()
    if MORNING_START <= t < AFTERNOON_START:
        return "morning"
    if t >= AFTERNOON_START or t < NIGHT_START:
        return "afternoon"
    return "night"


def get_operational_day(dt: datetime) -> date:
    """The operational day rolls over at 08:30:00, not midnight."""
    if dt.time() < MORNING_START:
        return (dt - timedelta(days=1)).date()
    return dt.date()


def get_team(shift: Shift) -> Team:
    return "morning" if shift == "morning" else "afternoon_night"


@dataclass(frozen=True)
class Window:
    start: datetime
    end: datetime  # exclusive upper bound


def shift_window(operational_day: date, shift: Shift) -> Window:
    if shift == "morning":
        start = datetime.combine(operational_day, MORNING_START)
        end = datetime.combine(operational_day, AFTERNOON_START)
    elif shift == "afternoon":
        start = datetime.combine(operational_day, AFTERNOON_START)
        end = datetime.combine(operational_day + timedelta(days=1), NIGHT_START)
    elif shift == "night":
        start = datetime.combine(operational_day + timedelta(days=1), NIGHT_START)
        end = datetime.combine(operational_day + timedelta(days=1), MORNING_START)
    else:  # pragma: no cover - Literal guards this at type-check time
        raise ValueError(f"unknown shift: {shift!r}")
    return Window(start=start, end=end)


def operational_day_window(operational_day: date) -> Window:
    """The full 08:30 -> next-day 08:30 span, covering all three shifts."""
    start = datetime.combine(operational_day, MORNING_START)
    end = datetime.combine(operational_day + timedelta(days=1), MORNING_START)
    return Window(start=start, end=end)


@dataclass(frozen=True)
class OperationalContext:
    operational_day: date
    shift: Shift
    team: Team
    window_start: datetime
    window_end: datetime
    day_start: datetime
    day_end: datetime
    is_current: bool
    server_now: datetime

    def to_dict(self) -> dict:
        return {
            "operational_day": self.operational_day.isoformat(),
            "shift": self.shift,
            "shift_label": SHIFT_LABELS[self.shift],
            "team": self.team,
            "team_label": TEAM_LABELS[self.team],
            "window_start": self.window_start.isoformat(),
            "window_end": self.window_end.isoformat(),
            "day_start": self.day_start.isoformat(),
            "day_end": self.day_end.isoformat(),
            "is_current": self.is_current,
            "server_now": self.server_now.isoformat(),
        }


def resolve_context(
    requested_day: Optional[date],
    requested_shift: Optional[Shift],
) -> OperationalContext:
    """Resolve an operational context, defaulting to "now" for anything omitted.

    This is the one place that decides what "current" means - every endpoint
    and the SSE stream must call this instead of comparing dates themselves.
    """
    now = datetime.now()
    current_day = get_operational_day(now)
    current_shift = get_shift(now)

    op_day = requested_day if requested_day is not None else current_day
    shift = requested_shift if requested_shift is not None else current_shift

    window = shift_window(op_day, shift)
    day_window = operational_day_window(op_day)

    is_current = (op_day == current_day) and (shift == current_shift)

    return OperationalContext(
        operational_day=op_day,
        shift=shift,
        team=get_team(shift),
        window_start=window.start,
        window_end=window.end,
        day_start=day_window.start,
        day_end=day_window.end,
        is_current=is_current,
        server_now=now,
    )
