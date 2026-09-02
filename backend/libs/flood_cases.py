"""The `flood_cases` collection: document shape, field normalisation, and the
validation that stands between a request body and a stored dispatch record.

Kept in its own module rather than added to `libs.aggregations` or
`libs.call_log`. Those two serve the EMS report pages, whose queries are built
around `incidents` - a collection this feature shares nothing with. The two
schemas describe different events (a 1669 call vs. a flood rescue request) and
have no field in common, so a join was never on the table and neither was a
shared module.

Nothing here imports `libs.lookups`, so a flood write cannot reach the cache
the three report pages depend on.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from dataclasses import dataclass
from datetime import date as date_cls, datetime, timedelta
from typing import Any, Optional

from libs.configs import db
from libs.flood_lookups import AreaLookupError, resolve_area
from libs.shift import SHIFT_LABELS, Shift, get_operational_day, get_shift, now_local

COLLECTION = "flood_cases"

# --- fixed vocabularies -----------------------------------------------------
#
# Stored as codes with the Thai label derived on read. The area fields are the
# deliberate exception (see `AreaSnapshot`): those come from a master table
# that can be re-edited, while these three lists are part of the form itself
# and change only when the form does.

# The operators' spreadsheet wrote the channel out in full ("โทรศัพท์ หมายเลข
# 1669"); the form shows the short label. Both spellings resolve to the same
# code so a pasted row and a fresh entry cannot end up as two different
# channels.
CHANNEL_LABELS: dict[str, str] = {
    "1669": "1669",
    "second_call": "Second Call",
    "radio": "วิทยุ",
}
CHANNEL_ALIASES: dict[str, str] = {
    "1669": "1669",
    "โทรศัพท์ หมายเลข 1669": "1669",
    "โทรศัพท์หมายเลข 1669": "1669",
    "second call": "second_call",
    "secondcall": "second_call",
    "วิทยุ": "radio",
}

GENDER_LABELS: dict[str, str] = {"male": "ชาย", "female": "หญิง"}
GENDER_ALIASES: dict[str, str] = {"male": "male", "ชาย": "male", "female": "female", "หญิง": "female"}

# Two states only, matching the column the spreadsheet already had: a case is
# either finished or it is not. `pending` is this codebase's name for the
# blank cell - it needs one because the table filters on it - and Export
# writes it back out as a blank so an exported sheet still reads like the
# original.
STATUS_SUCCESS = "success"
STATUS_PENDING = "pending"
STATUS_LABELS: dict[str, str] = {STATUS_SUCCESS: "สำเร็จ", STATUS_PENDING: "ยังไม่สำเร็จ"}
STATUS_EXPORT_LABELS: dict[str, str] = {STATUS_SUCCESS: "สำเร็จ", STATUS_PENDING: ""}
STATUS_ALIASES: dict[str, str] = {
    "success": STATUS_SUCCESS,
    "สำเร็จ": STATUS_SUCCESS,
    "pending": STATUS_PENDING,
    "ยังไม่สำเร็จ": STATUS_PENDING,
    "": STATUS_PENDING,
}

# Free-text field with shortcuts rather than a closed list: the spreadsheet
# shows this column holds a *relationship* ("ญาติ", "จนท."), not a person's
# name, and the tail of it is long and unpredictable.
REPORTER_SHORTCUTS: tuple[str, ...] = ("ญาติ", "จนท.", "ผู้ป่วยเอง", "ผู้นำชุมชน", "อสม.")

# Age is optional, but a typo that stores 950 would sit in the record forever.
MAX_AGE = 130

# How far back the duplicate check looks. During a flood one flooded house
# generates four or five calls; six hours is long enough to catch the repeats
# and short enough that yesterday's rescue does not shadow today's.
DUPLICATE_WINDOW_HOURS = 6


class FloodCaseError(ValueError):
    """A request could not be turned into a valid case.

    Message is operator-facing Thai: it is shown next to the field, so it has
    to say which value was refused rather than that validation failed.
    """


# --- field normalisation ----------------------------------------------------

_NON_DIGITS = re.compile(r"\D")


def normalise_phone(value: Optional[str]) -> str:
    """Digits only.

    The same caller is written "083-1869048" by one operator and
    "0843986400" by the next, and the duplicate check is worthless if those
    two spellings do not compare equal. Storing the digits and formatting on
    read means the search box also matches whichever form is typed.
    """
    if not value:
        return ""
    return _NON_DIGITS.sub("", str(value))


def format_phone(digits: Optional[str]) -> str:
    """Group the stored digits the way the operators read them aloud.

    Anything that is not a recognisable Thai mobile or landline length is
    returned untouched - a number worth storing is worth showing exactly as
    it was given, even when it does not fit the pattern.
    """
    if not digits:
        return ""
    if len(digits) == 10:
        return digits[:3] + "-" + digits[3:]
    if len(digits) == 9:
        return digits[:3] + "-" + digits[3:]
    return digits


def _clean_text(value: Optional[str]) -> str:
    """Trim, and collapse the runs of spaces a spreadsheet paste leaves
    behind, without touching newlines inside the long free-text fields."""
    if value is None:
        return ""
    lines = [" ".join(line.split()) for line in str(value).splitlines()]
    return "\n".join(lines).strip()


def resolve_channel(value: Optional[str]) -> Optional[str]:
    if value is None or _clean_text(value) == "":
        return None
    raw = _clean_text(value)
    code = CHANNEL_ALIASES.get(raw) or CHANNEL_ALIASES.get(raw.lower())
    if code is None:
        raise FloodCaseError("ไม่รู้จักช่องทาง " + repr(raw))
    return code


def resolve_gender(value: Optional[str]) -> Optional[str]:
    if value is None or _clean_text(value) == "":
        return None
    raw = _clean_text(value)
    code = GENDER_ALIASES.get(raw) or GENDER_ALIASES.get(raw.lower())
    if code is None:
        raise FloodCaseError("ไม่รู้จักเพศ " + repr(raw))
    return code


def resolve_status(value: Optional[str]) -> str:
    """Absent means pending, because that is what the blank cell meant."""
    if value is None:
        return STATUS_PENDING
    raw = _clean_text(value)
    code = STATUS_ALIASES.get(raw) or STATUS_ALIASES.get(raw.lower())
    if code is None:
        raise FloodCaseError("ไม่รู้จักสถานะ " + repr(raw))
    return code


def resolve_shift(value: Optional[str], reported_at: datetime) -> Shift:
    """The shift the case belongs to.

    Defaulted from the report time through `libs.shift.get_shift` - the one
    place that knows the 08:30 boundary - but overridable, because a call that
    arrives at 16:28 is regularly still being written up by the incoming team.
    """
    if value is None or _clean_text(value) == "":
        return get_shift(reported_at)
    raw = _clean_text(value)
    if raw in SHIFT_LABELS:
        return raw  # type: ignore[return-value]
    for code, label in SHIFT_LABELS.items():
        if label == raw:
            return code
    raise FloodCaseError("ไม่รู้จักเวร " + repr(raw) + " (ต้องเป็น morning, afternoon หรือ night)")


def resolve_age(value) -> Optional[int]:
    """Optional: the spreadsheet has real rows with both age and sex blank,
    because the caller hung up before either was asked."""
    if value is None or value == "":
        return None
    try:
        age = int(value)
    except (TypeError, ValueError):
        raise FloodCaseError("อายุต้องเป็นตัวเลข") from None
    if age < 0 or age > MAX_AGE:
        raise FloodCaseError("อายุต้องอยู่ระหว่าง 0 ถึง " + str(MAX_AGE))
    return age


def new_case_id(reported_at: datetime) -> str:
    """A stable, URL-safe identity for one case.

    Everything that points at a case - the drawer's `?case=` parameter, the
    duplicate warning's link, a bulk status update - uses this. Notably the
    table's "ลำดับ" column does not and cannot: that number is counted at
    render time from whatever rows the current filter produced, so it means
    something different on every screen.
    """
    return "FLD-" + reported_at.strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:8].upper()


# --- document assembly ------------------------------------------------------


def build_case_document(payload: dict, *, now: Optional[datetime] = None) -> dict:
    """Validate a request body and return the document to insert.

    Only amphoe, tambon and the chief complaint are required. Everything else
    may be blank on purpose: a call that drops after twenty seconds still has
    to be recorded, and a form that refuses to save what little was heard just
    moves that record onto a sticky note.
    """
    now = now or now_local()

    reported_at = payload.get("reported_at") or now
    if not isinstance(reported_at, datetime):
        raise FloodCaseError("เวลารับแจ้งไม่ถูกต้อง")

    try:
        area = resolve_area(payload.get("district") or "", payload.get("subdistrict") or "")
    except AreaLookupError as exc:
        raise FloodCaseError(str(exc)) from exc

    chief_complaint = _clean_text(payload.get("chief_complaint"))
    if not chief_complaint:
        raise FloodCaseError("ต้องระบุอาการสำคัญ / รายละเอียด")

    shift = resolve_shift(payload.get("shift"), reported_at)

    document = {
        "case_id": new_case_id(reported_at),
        # Merged from the form's separate date and time inputs. Two fields on
        # screen because that is how the information arrives on a call; one
        # field in the database because every query here is a time range, and
        # a split pair cannot be range-scanned or indexed as one.
        "reported_at": reported_at,
        # Derived, and rewritten on every edit of `reported_at`. Stored rather
        # than computed per query because "วันนี้" and "เวรนี้" are the two
        # filters the table uses constantly, and the 08:30 rollover makes them
        # a two-sided range rather than an equality on the calendar date.
        "operational_day": _as_midnight(get_operational_day(reported_at)),
        "shift": shift,
        "agent_name": _clean_text(payload.get("agent_name")) or None,
        "agent_extension": _clean_text(payload.get("agent_extension")) or None,
        "channel": resolve_channel(payload.get("channel")),
        "reporter": _clean_text(payload.get("reporter")) or None,
        "phone": normalise_phone(payload.get("phone")) or None,
        **area.to_fields(),
        # Free text, never parsed. The column is called "พิกัด" but the real
        # data is landmarks - "ร้านขนมจีนเมืองคอน", "ม.2 บ้านบือราแง" - so
        # validating it as a coordinate would reject almost every real entry.
        "location_note": _clean_text(payload.get("location_note")) or None,
        "gender": resolve_gender(payload.get("gender")),
        "age": resolve_age(payload.get("age")),
        "chief_complaint": chief_complaint,
        "ddpm_coordination": _clean_text(payload.get("ddpm_coordination")) or None,
        "operating_unit": _clean_text(payload.get("operating_unit")) or None,
        "assistance": _clean_text(payload.get("assistance")) or None,
        "status": resolve_status(payload.get("status")),
        "remarks": _clean_text(payload.get("remarks")) or None,
        "created_at": now,
        "updated_at": now,
    }
    return document


def _as_midnight(day: date_cls) -> datetime:
    """BSON has no date type, only datetime; storing the operational day as
    midnight keeps it comparable with `$eq` instead of a string match."""
    return datetime(day.year, day.month, day.day)


# --- indexes ----------------------------------------------------------------


def ensure_indexes() -> None:
    """Create every index this collection is queried by.

    `incidents` was left with no secondary index at all, which it survives
    because the dashboards read one operational day at a time out of a small
    collection. This one will not: it is filtered, searched and duplicate-
    checked on nearly every keystroke while an operator is on a call, and it
    grows for as long as the flood lasts.

    Idempotent - `create_index` on an existing index is a no-op - so it is
    safe to call on every startup and from the seed script.
    """
    collection = db[COLLECTION]
    collection.create_index("case_id", unique=True)
    # The table's default order, and every date-range filter.
    collection.create_index([("reported_at", -1)])
    # The two duplicate-check paths. Compound with the timestamp because the
    # check is always "this phone/area *within the last six hours*" - a plain
    # single-field index would still have to scan every case that number ever
    # produced, which during a flood is the repeat callers themselves.
    collection.create_index([("phone", 1), ("reported_at", -1)])
    collection.create_index([("subdistrict_code", 1), ("reported_at", -1)])
    # Tab filters and the column filters on the table header.
    collection.create_index([("status", 1), ("reported_at", -1)])
    collection.create_index([("operational_day", -1), ("shift", 1)])
    collection.create_index([("district_code", 1), ("reported_at", -1)])
    collection.create_index([("agent_name", 1), ("reported_at", -1)])
    # No text index: Mongo's text search tokenises on whitespace, and Thai is
    # written without it, so a text index over these fields would match almost
    # nothing. The search box uses a regex over the filtered subset instead.


# --- reading -----------------------------------------------------------------

TAB_ALL = "all"
TAB_TODAY = "today"
TAB_CURRENT_SHIFT = "current_shift"
TAB_PENDING = "pending"
TAB_SUCCESS = "success"
TABS: tuple[str, ...] = (TAB_ALL, TAB_TODAY, TAB_CURRENT_SHIFT, TAB_PENDING, TAB_SUCCESS)

# The table sends the whole filtered set to the browser and paginates there,
# so the "ลำดับ" column can be a plain array index - continuous across pages
# and restarting at 1 whenever the filter changes, which is the entire reason
# no sequence number is stored. This caps how much that can cost: past it the
# response says so and the operator narrows the filter.
DEFAULT_LIMIT = 500
MAX_LIMIT = 2000

# Fields the search box looks through. Chosen from what operators actually
# recall about a call they took twenty minutes ago - a phone number, a tambon,
# who rang, what was wrong, who was sent.
SEARCH_FIELDS = (
    "reporter",
    "chief_complaint",
    "operating_unit",
    "ddpm_coordination",
    "assistance",
    "remarks",
    "location_note",
    "subdistrict_name",
    "district_name",
    "agent_name",
)


@dataclass
class CaseFilters:
    """Everything the table can narrow by, in one object.

    A dataclass rather than a bag of keyword arguments because the same
    filters are applied three times per request - the page of rows, the total,
    and the five tab counts - and they must not drift apart between them.
    """

    tab: str = TAB_ALL
    date_from: Optional[date_cls] = None
    date_to: Optional[date_cls] = None
    district_code: Optional[str] = None
    shift: Optional[str] = None
    agent_name: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None
    limit: int = DEFAULT_LIMIT
    offset: int = 0

    def normalised(self) -> "CaseFilters":
        tab = self.tab if self.tab in TABS else TAB_ALL
        limit = max(1, min(int(self.limit or DEFAULT_LIMIT), MAX_LIMIT))
        return CaseFilters(
            tab=tab,
            date_from=self.date_from,
            date_to=self.date_to,
            district_code=_clean_text(self.district_code) or None,
            shift=_clean_text(self.shift) or None,
            agent_name=_clean_text(self.agent_name) or None,
            status=_clean_text(self.status) or None,
            search=_clean_text(self.search) or None,
            limit=limit,
            offset=max(0, int(self.offset or 0)),
        )


def _search_clause(search: str) -> dict:
    """Case-insensitive substring match across the text fields, plus the phone.

    A regex rather than a `$text` index: Mongo's text search splits on
    whitespace and Thai is written without it, so a text index over these
    fields would match almost nothing an operator typed. The pattern is
    escaped, so a caller typing "+" or "(" searches for that character instead
    of writing a regex by accident.
    """
    escaped = re.escape(search)
    clauses: list[dict] = [{f: {"$regex": escaped, "$options": "i"}} for f in SEARCH_FIELDS]

    # A phone typed with or without dashes has to find the same case, so the
    # separators are stripped from the query the same way they were stripped
    # from the stored value.
    digits = normalise_phone(search)
    if digits:
        clauses.append({"phone": {"$regex": re.escape(digits)}})

    return {"$or": clauses}


def build_query(filters: CaseFilters, *, now: Optional[datetime] = None) -> dict:
    """Translate the filter object into a Mongo query.

    Date filtering goes through `operational_day`, not `reported_at`: the
    centre's day starts at 08:30, so a case logged at 02:00 belongs to the
    previous day's sheet. Comparing calendar dates here would file it under
    the wrong day and make the totals disagree with the paper record.
    """
    now = now or now_local()
    query: dict[str, Any] = {}
    and_clauses: list[dict] = []

    if filters.date_from or filters.date_to:
        span: dict[str, Any] = {}
        if filters.date_from:
            span["$gte"] = _as_midnight(filters.date_from)
        if filters.date_to:
            span["$lte"] = _as_midnight(filters.date_to)
        query["operational_day"] = span

    if filters.tab == TAB_TODAY:
        query["operational_day"] = _as_midnight(get_operational_day(now))
    elif filters.tab == TAB_CURRENT_SHIFT:
        # Both halves, because a shift is identified by the pair: the night
        # shift of day D runs into the calendar morning of D+1.
        query["operational_day"] = _as_midnight(get_operational_day(now))
        query["shift"] = get_shift(now)
    elif filters.tab == TAB_PENDING:
        query["status"] = STATUS_PENDING
    elif filters.tab == TAB_SUCCESS:
        query["status"] = STATUS_SUCCESS

    if filters.district_code:
        query["district_code"] = filters.district_code
    if filters.shift:
        query["shift"] = resolve_shift(filters.shift, now)
    if filters.agent_name:
        query["agent_name"] = filters.agent_name
    if filters.status:
        query["status"] = resolve_status(filters.status)

    if filters.search:
        and_clauses.append(_search_clause(filters.search))

    if and_clauses:
        query["$and"] = and_clauses
    return query


def serialise_case(doc: dict) -> dict:
    """One case in the shape the table and the drawer both read.

    Labels are resolved here rather than in the browser so the export, the
    duplicate warning and the table cannot disagree about what a code means.
    """
    reported_at: datetime = doc["reported_at"]
    phone = doc.get("phone") or ""
    channel = doc.get("channel")
    gender = doc.get("gender")
    status = doc.get("status") or STATUS_PENDING
    shift = doc.get("shift")

    return {
        "case_id": doc["case_id"],
        "reported_at": reported_at.isoformat(),
        # Pre-split for the two places that need them: the table shows date
        # and time in one cell, and the duplicate warning reads "14.20 น.".
        "date": reported_at.date().isoformat(),
        "time": reported_at.strftime("%H.%M"),
        "operational_day": (doc.get("operational_day") or reported_at).date().isoformat()
        if isinstance(doc.get("operational_day"), datetime)
        else reported_at.date().isoformat(),
        "shift": shift,
        "shift_label": SHIFT_LABELS.get(shift, "") if shift else "",
        "agent_name": doc.get("agent_name") or "",
        "agent_extension": doc.get("agent_extension") or "",
        "channel": channel or "",
        "channel_label": CHANNEL_LABELS.get(channel, "") if channel else "",
        "reporter": doc.get("reporter") or "",
        "phone": phone,
        "phone_display": format_phone(phone),
        "district_code": doc.get("district_code") or "",
        "district_name": doc.get("district_name") or "",
        "subdistrict_code": doc.get("subdistrict_code") or "",
        "subdistrict_name": doc.get("subdistrict_name") or "",
        "location_note": doc.get("location_note") or "",
        "gender": gender or "",
        "gender_label": GENDER_LABELS.get(gender, "") if gender else "",
        "age": doc.get("age"),
        "chief_complaint": doc.get("chief_complaint") or "",
        "ddpm_coordination": doc.get("ddpm_coordination") or "",
        "operating_unit": doc.get("operating_unit") or "",
        "assistance": doc.get("assistance") or "",
        "status": status,
        "status_label": STATUS_LABELS.get(status, ""),
        "remarks": doc.get("remarks") or "",
        "updated_at": (doc.get("updated_at") or reported_at).isoformat(),
    }


def _tab_counts(filters: CaseFilters, now: datetime) -> dict[str, int]:
    """The number beside each tab, counted under the *other* filters.

    The tabs sit above the search box and the column filters, so "ยังไม่
    สำเร็จ 3" has to mean three within what is currently being looked at - a
    count of the whole collection next to a filtered table is a number nobody
    can reconcile.
    """
    counts: dict[str, int] = {}
    for tab in TABS:
        scoped = CaseFilters(**{**filters.__dict__, "tab": tab})
        counts[tab] = db[COLLECTION].count_documents(build_query(scoped, now=now))
    return counts


def list_cases(filters: CaseFilters, *, now: Optional[datetime] = None) -> dict:
    """The payload behind both `GET /api/flood-cases` and its SSE stream.

    One shape for both so the stream's first frame is byte-for-byte what the
    plain GET returns, exactly as the incident-history page already does -
    which is what lets the frontend open the stream alone instead of fetching
    and then subscribing.
    """
    now = now or now_local()
    filters = filters.normalised()
    query = build_query(filters, now=now)

    total = db[COLLECTION].count_documents(query)
    cursor = (
        db[COLLECTION]
        .find(query, {"_id": 0})
        .sort([("reported_at", -1), ("case_id", -1)])
        .skip(filters.offset)
        .limit(filters.limit)
    )
    cases = [serialise_case(doc) for doc in cursor]

    return {
        "context": _context(now),
        "cases": cases,
        "total": total,
        "offset": filters.offset,
        "limit": filters.limit,
        # True when the filter matched more than one page's worth. The table
        # says so rather than silently showing a prefix, because an operator
        # scanning for a duplicate has to know the list is not complete.
        "truncated": filters.offset + len(cases) < total,
        "counts": _tab_counts(filters, now),
    }


def _context(now: datetime) -> dict:
    """Which operational day and shift "now" falls in.

    Derived here, never in the browser: the 08:30 rollover is `libs.shift`'s
    to decide, and the client's clock is not the centre's.
    """
    day = get_operational_day(now)
    shift = get_shift(now)
    return {
        "operational_day": day.isoformat(),
        "shift": shift,
        "shift_label": SHIFT_LABELS[shift],
        "server_now": now.isoformat(),
    }


def get_case(case_id: str) -> Optional[dict]:
    doc = db[COLLECTION].find_one({"case_id": case_id}, {"_id": 0})
    return serialise_case(doc) if doc else None


# --- duplicate detection ------------------------------------------------------


def _location_matches(a: str, b: str) -> bool:
    """Whether two landmark notes plausibly describe the same place.

    Substring either way, not equality: one operator writes "ม.2 บ้านบือราแง"
    and the next just "บ้านบือราแง". The four-character floor keeps "ม.1"
    from matching every address in the tambon - this only decides whether a
    non-blocking warning appears, so a near miss costs nothing and a false
    positive costs a glance.
    """
    a, b = a.strip().lower(), b.strip().lower()
    if not a or not b:
        return False
    if a == b:
        return True
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    return len(shorter) >= 4 and shorter in longer


def find_duplicates(
    *,
    phone: Optional[str] = None,
    subdistrict_code: Optional[str] = None,
    location_note: Optional[str] = None,
    exclude_case_id: Optional[str] = None,
    now: Optional[datetime] = None,
    limit: int = 5,
) -> list[dict]:
    """Cases from the last six hours that may be the same incident.

    The reason this page exists: during a flood one house generates four or
    five calls and, without this, four or five boats. It warns and never
    blocks - repeat callers are sometimes genuinely separate incidents at the
    same address, and a form that refuses to save loses the second one.

    Both signals are indexed as `(field, reported_at)` compounds, because the
    query is always "this phone/tambon *within the window*" and this runs on
    nearly every keystroke of a phone number.
    """
    now = now or now_local()
    since = now - timedelta(hours=DUPLICATE_WINDOW_HOURS)

    phone_digits = normalise_phone(phone)
    note = _clean_text(location_note)

    signals: list[dict] = []
    if phone_digits:
        signals.append({"phone": phone_digits, "reported_at": {"$gte": since}})
    if subdistrict_code:
        signals.append({"subdistrict_code": subdistrict_code, "reported_at": {"$gte": since}})
    if not signals:
        return []

    query: dict[str, Any] = {"$or": signals}
    if exclude_case_id:
        # An open case must not warn about itself while it is being edited.
        query["case_id"] = {"$ne": exclude_case_id}

    matches: list[dict] = []
    for doc in db[COLLECTION].find(query, {"_id": 0}).sort([("reported_at", -1)]).limit(50):
        if phone_digits and doc.get("phone") == phone_digits:
            reason = "phone"
        elif (
            subdistrict_code
            and doc.get("subdistrict_code") == subdistrict_code
            and note
            and _location_matches(note, doc.get("location_note") or "")
        ):
            reason = "location"
        else:
            # Same tambon but a different place: during a flood that is most
            # of the tambon, so it is not on its own a reason to warn.
            continue

        case = serialise_case(doc)
        case["match_reason"] = reason
        matches.append(case)
        if len(matches) >= limit:
            break

    return matches


# --- writing ------------------------------------------------------------------


def insert_case(payload: dict, *, now: Optional[datetime] = None) -> dict:
    now = now or now_local()
    document = build_case_document(payload, now=now)
    db[COLLECTION].insert_one(dict(document))
    return serialise_case(document)


def apply_update(case_id: str, payload: dict, *, now: Optional[datetime] = None) -> Optional[dict]:
    """Rewrite a case from a full form submission.

    `reported_at` omitted means "leave it as it was", unlike on create where
    it means "now": an edit made the following morning must not restamp the
    case with the time somebody corrected it. `operational_day` and `shift`
    are re-derived whenever it does change, so a corrected time cannot leave
    the case filed under the wrong day.
    """
    now = now or now_local()
    existing = db[COLLECTION].find_one({"case_id": case_id})
    if existing is None:
        return None

    merged = dict(payload)
    if not merged.get("reported_at"):
        merged["reported_at"] = existing["reported_at"]
    if merged.get("shift") is None:
        merged["shift"] = existing.get("shift")

    document = build_case_document(merged, now=now)
    # Identity and provenance survive an edit; everything else is replaced.
    document["case_id"] = case_id
    document["created_at"] = existing.get("created_at", now)
    document["updated_at"] = now

    db[COLLECTION].update_one({"case_id": case_id}, {"$set": document})
    return serialise_case(document)


def set_status(case_id: str, status: str, *, now: Optional[datetime] = None) -> Optional[dict]:
    """Update only the status field.

    Separate from `apply_update` on purpose: marking a case finished is the
    most frequent action on the page and happens straight from the table row.
    Routing it through the full-form path would mean the table had to hold and
    resend all nineteen fields, which would let a stale row overwrite what
    somebody else is typing into the drawer right now.
    """
    now = now or now_local()
    resolved = resolve_status(status)
    result = db[COLLECTION].update_one(
        {"case_id": case_id}, {"$set": {"status": resolved, "updated_at": now}}
    )
    if result.matched_count == 0:
        return None
    return get_case(case_id)


def bulk_set_status(case_ids: list[str], status: str, *, now: Optional[datetime] = None) -> int:
    now = now or now_local()
    ids = [c for c in (case_ids or []) if c]
    if not ids:
        return 0
    resolved = resolve_status(status)
    result = db[COLLECTION].update_many(
        {"case_id": {"$in": ids}}, {"$set": {"status": resolved, "updated_at": now}}
    )
    return result.modified_count


# --- export -------------------------------------------------------------------

# Column order follows the spreadsheet this page replaces, not the form. The
# form was deliberately re-ordered to match the order a call actually arrives
# in; an exported file is read alongside the old sheets, so it keeps theirs.
EXPORT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("seq", "ลำดับ"),
    ("date", "วันที่"),
    ("shift_label", "เวร"),
    ("agent_name", "เจ้าหน้าที่รับแจ้ง"),
    ("time", "เวลารับแจ้ง"),
    ("channel_label", "ช่องทาง"),
    ("reporter", "ผู้แจ้ง"),
    ("phone_display", "เบอร์โทรศัพท์"),
    ("location_note", "พิกัด"),
    ("subdistrict_name", "ตำบล"),
    ("district_name", "อำเภอ"),
    ("gender_label", "เพศ"),
    ("age", "อายุ"),
    ("chief_complaint", "อาการสำคัญ"),
    ("ddpm_coordination", "ประสานงานทีม ปภ.อำเภอ"),
    ("assistance", "การช่วยเหลือ"),
    ("status_export", "สำเร็จ"),
    ("operating_unit", "หน่วยปฏิบัติ"),
    ("remarks", "เพิ่มเติม"),
)


def export_csv(filters: CaseFilters, *, now: Optional[datetime] = None) -> str:
    """The filtered cases as CSV text.

    CSV rather than XLSX because writing XLSX needs a library this project
    does not have, and adding one was not in scope. Written with a BOM by the
    caller so Excel opens the Thai text correctly rather than as mojibake.

    "ลำดับ" is generated here, counting the exported rows in order - the same
    render-time numbering the table uses, and the same reason it is not
    stored: two operators saving at once cannot collide over a number that
    only ever exists in one output.
    """
    now = now or now_local()
    filters = filters.normalised()
    query = build_query(filters, now=now)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([header for _, header in EXPORT_COLUMNS])

    cursor = (
        db[COLLECTION]
        .find(query, {"_id": 0})
        .sort([("reported_at", 1), ("case_id", 1)])
        .limit(MAX_LIMIT)
    )
    for index, doc in enumerate(cursor, start=1):
        case = serialise_case(doc)
        case["seq"] = index
        case["status_export"] = STATUS_EXPORT_LABELS.get(case["status"], "")
        writer.writerow(["" if case.get(key) is None else case.get(key, "") for key, _ in EXPORT_COLUMNS])

    return buffer.getvalue()


def export_filename(now: Optional[datetime] = None) -> str:
    now = now or now_local()
    return "flood-cases-" + now.strftime("%Y%m%d-%H%M") + ".csv"
