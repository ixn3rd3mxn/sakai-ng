"""In-memory cache of everything a `flood_cases` document references by key
- the area master data (`flood_district`, `flood_subdistrict`), the operator
roster (`agents`) and the reporting channels (`reporting_channels`) - plus
strict resolution of whatever an incoming request carries (a code, an id, or
an exact name) into the key that is stored.

A case stores keys only: `district_id`, `subdistrict_id`, `agent_id`,
`channel_id`. Codes and names are looked up here on every read. The master data is
tiny and, by the owners' own account, does not get renamed, so the join is
a dictionary lookup rather than a query.

Deliberately kept out of `libs.lookups`. That module is loaded once at
startup and `main._require_lookups` turns any failure to populate it into a
503 on *every* reference-backed endpoint - which is all three EMS report
pages. Folding two more collections into `lookups.load()` would mean a slow
or broken flood seed takes those dashboards down with it, so this module
loads on its own, fails on its own, and nothing in `lookups` can reach it.

The cache is tiny and effectively static (12 districts, 115 subdistricts, 19
agents, 3 channels), so it is read once rather than joined against Mongo on
every case read or duplicate check - and the duplicate check runs on nearly
every keystroke of a phone number. `agents` and `reporting_channels` belong to
the EMS pages and are only ever read here.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Optional

from libs.configs import db

logger = logging.getLogger(__name__)

DISTRICT_COLLECTION = "flood_district"
SUBDISTRICT_COLLECTION = "flood_subdistrict"
AGENT_COLLECTION = "agents"
CHANNEL_COLLECTION = "reporting_channels"


class FloodLookupError(ValueError):
    """A reference could not be resolved to exactly one record.

    Carries a message meant to be shown to the caller: a case is a dispatch
    record, so refusing an ambiguous or unknown value is the whole point.
    """


class AreaLookupError(FloodLookupError):
    """An area could not be resolved to exactly one record - see
    `resolve_district`."""


@dataclass(frozen=True)
class AreaSnapshot:
    """A resolved (amphoe, tambon) pair.

    The *ids* are what a `flood_cases` document stores. They are the row
    numbers of the master CSVs, chosen over the official codes for their
    size (an int32 against a 4-6 character string) on the owners' word that
    the master files are fixed. That word is load-bearing: a re-export of
    either CSV in a different order re-points every stored case, and nothing
    would notice. `seed_flood_areas.py` therefore refuses to renumber - it
    upserts by code and reports, never rewrites, an id that changed.

    Codes and names are carried for the caller's convenience and re-read
    from the cache on every read of a case.
    """

    district_id: int
    district_code: str
    district_name: str
    subdistrict_id: int
    subdistrict_code: str
    subdistrict_name: str

    def to_fields(self) -> dict[str, int]:
        return {
            "district_id": self.district_id,
            "subdistrict_id": self.subdistrict_id,
        }


# code -> {"district_id", "district_code", "district_name"}
_districts: dict[str, dict] = {}
# code -> {"subdistrict_id", "district_id", "district_code",
#          "subdistrict_code", "subdistrict_name"}
_subdistricts: dict[str, dict] = {}
# normalised name -> district code
_district_by_name: dict[str, str] = {}
# district_id -> district code; subdistrict_id -> subdistrict code. The ids
# are what a case stores, so every read starts here.
_district_code_by_id: dict[int, str] = {}
_subdistrict_code_by_id: dict[int, str] = {}
# (district_code, normalised tambon name) -> subdistrict code. Keyed on the
# pair rather than the name alone: tambon names are not guaranteed unique
# nationally, and resolving one without knowing its amphoe is exactly the
# guess this module refuses to make.
_subdistrict_by_name: dict[tuple[str, str], str] = {}
# normalised tambon name -> every code carrying it, across all amphoe. Used
# only to explain a rejection: a name that exists in a *different* amphoe is
# an operator picking the wrong row, and telling them which amphoe it belongs
# to is the difference between a fixable mistake and "the system says no".
_subdistrict_names: dict[str, list[str]] = {}

# agent_id -> {"agent_id", "agent_name", "agent_extension"}, roster order.
_agents: dict[str, dict] = {}
# normalised agent name -> agent_id
_agent_by_name: dict[str, str] = {}
# channel_id -> channel_name
_channels: dict[int, str] = {}
# normalised, lower-cased channel name -> channel_id
_channel_by_name: dict[str, int] = {}

# The operators' spreadsheet wrote the channel out in full ("โทรศัพท์
# หมายเลข 1669"), and the form used to store a code of its own. All of them
# resolve to the same row, so a pasted row, an old payload and a fresh entry
# cannot land on different channels.
CHANNEL_ALIASES: dict[str, str] = {
    "โทรศัพท์ หมายเลข 1669": "1669",
    "โทรศัพท์หมายเลข 1669": "1669",
    "second call": "2nd",
    "second_call": "2nd",
    "secondcall": "2nd",
    "radio": "วิทยุ",
}

_loaded = False

# Same reasoning as `lookups._load_lock`: `load()` clears before it fills, so
# two concurrent callers could otherwise publish a half-populated cache with
# `_loaded` already true.
_load_lock = threading.Lock()


def normalise_name(value: str) -> str:
    """Fold the whitespace variations that come off a spreadsheet paste.

    Whitespace only: no prefix matching, no stripping of a leading "อำเภอ" /
    "ตำบล", nothing that could collapse two different records into one match.
    """
    return " ".join(str(value or "").split())


def loaded() -> bool:
    """Whether `load()` has completed successfully at least once.

    Every flood endpoint that resolves or lists an area must check this. An
    empty cache does not raise on its own - it would just reject every area as
    unknown, which reads to the operator as "the master data is wrong" rather
    than "the database is unreachable".
    """
    return _loaded


def load() -> None:
    """(Re)load both area collections into memory.

    Serialised, so the cache is never observed half-cleared.
    """
    global _loaded
    with _load_lock:
        _loaded = False
        districts = list(db[DISTRICT_COLLECTION].find({}, {"_id": 0}))
        subdistricts = list(db[SUBDISTRICT_COLLECTION].find({}, {"_id": 0}))
        agents = list(db[AGENT_COLLECTION].find({}, {"_id": 0}))
        channels = list(db[CHANNEL_COLLECTION].find({}, {"_id": 0}))
        install(districts, subdistricts, agents, channels)
        _loaded = True


def install(
    districts: list[dict],
    subdistricts: list[dict],
    agents: Optional[list[dict]] = None,
    channels: Optional[list[dict]] = None,
) -> None:
    """Build the indexes from plain dicts.

    Split out from the Mongo read so the resolution rules - the part that has
    to be right - are testable without a database.
    """
    _districts.clear()
    _subdistricts.clear()
    _district_by_name.clear()
    _subdistrict_by_name.clear()
    _subdistrict_names.clear()
    _district_code_by_id.clear()
    _subdistrict_code_by_id.clear()
    _agents.clear()
    _agent_by_name.clear()
    _channels.clear()
    _channel_by_name.clear()

    for doc in districts:
        code = str(doc["district_code"])
        name = normalise_name(doc["district_name"])
        _districts[code] = {
            "district_id": int(doc["district_id"]),
            "district_code": code,
            "district_name": name,
        }
        _district_by_name[name] = code
        _district_code_by_id[_districts[code]["district_id"]] = code

    # district_id -> district_code, so a tambon row (which carries the CSV row
    # number of its amphoe, not the official code) can be attached to one.
    by_id = {d["district_id"]: d["district_code"] for d in _districts.values()}

    for doc in subdistricts:
        district_id = int(doc["district_id"])
        district_code = by_id.get(district_id)
        if district_code is None:
            # A tambon whose amphoe is absent cannot be validated against one,
            # so it is dropped rather than offered as a choice that would then
            # fail at write time.
            logger.warning(
                "%s row %s references unknown district_id %s; skipped",
                SUBDISTRICT_COLLECTION,
                doc.get("subdistrict_code"),
                district_id,
            )
            continue
        code = str(doc["subdistrict_code"])
        name = normalise_name(doc["subdistrict_name"])
        _subdistricts[code] = {
            "subdistrict_id": int(doc["subdistrict_id"]),
            "district_id": district_id,
            "district_code": district_code,
            "subdistrict_code": code,
            "subdistrict_name": name,
        }
        _subdistrict_by_name[(district_code, name)] = code
        _subdistrict_names.setdefault(name, []).append(code)
        _subdistrict_code_by_id[_subdistricts[code]["subdistrict_id"]] = code

    # Roster order, which is what the staff list on the wall is ordered by -
    # not alphabetical. `agent_id` is stored as a string, so sorting it as
    # text would run 1, 10, 11, ... 2; it is compared as a number, with any
    # non-numeric id sorted last rather than raising.
    roster = [
        {
            "agent_id": str(doc.get("agent_id") or ""),
            "agent_name": normalise_name(doc.get("agent_name") or ""),
            "agent_extension": str(doc.get("agent_extension") or ""),
        }
        for doc in (agents or [])
        if doc.get("agent_id") not in (None, "") and doc.get("agent_name")
    ]
    roster.sort(key=lambda a: (not a["agent_id"].isdigit(), int(a["agent_id"]) if a["agent_id"].isdigit() else 0, a["agent_name"]))
    for row in roster:
        _agents[row["agent_id"]] = row
        _agent_by_name[row["agent_name"]] = row["agent_id"]

    for doc in channels or []:
        if doc.get("channel_id") is None or not doc.get("channel_name"):
            continue
        channel_id = int(doc["channel_id"])
        name = normalise_name(doc["channel_name"])
        _channels[channel_id] = name
        _channel_by_name[name.lower()] = channel_id


def districts() -> list[dict]:
    """Every amphoe, in official-code order."""
    return sorted(_districts.values(), key=lambda d: d["district_code"])


def subdistricts(district_code: Optional[str] = None) -> list[dict]:
    """Every tambon, or only those inside one amphoe.

    The frontend fetches the unfiltered list once and narrows it client-side
    while the operator is still on the phone; the argument exists for callers
    that want the server to do the narrowing.
    """
    rows = sorted(_subdistricts.values(), key=lambda s: s["subdistrict_code"])
    if district_code is None:
        return rows
    code = str(district_code)
    return [row for row in rows if row["district_code"] == code]


def resolve_district(value: str) -> dict:
    """One amphoe, from either its official code or its exact name.

    Raises rather than guesses. "เมือง" is not accepted for "เมืองปัตตานี": a
    prefix that happens to be unique in Pattani today stops being unique the
    moment the master file gains a district, and a case is a dispatch record -
    a wrong amphoe sends a boat to the wrong side of the province.
    """
    raw = normalise_name(value)
    if not raw:
        raise AreaLookupError("ต้องระบุอำเภอ")

    if raw in _districts:
        return _districts[raw]

    code = _district_by_name.get(raw)
    if code is None:
        raise AreaLookupError("ไม่รู้จักอำเภอ " + repr(raw) + " (ต้องตรงกับชื่อหรือรหัสอำเภอพอดี)")
    return _districts[code]


def resolve_area(district: str, subdistrict: str) -> AreaSnapshot:
    """Resolve an (amphoe, tambon) pair, enforcing that the second sits inside
    the first.

    The tambon is looked up *within* the resolved amphoe, so one belonging to
    another amphoe is rejected here rather than silently stored. The client
    already filters its dropdown by amphoe, but the client is not the thing
    that decides what gets written.
    """
    district_row = resolve_district(district)
    district_code = district_row["district_code"]

    raw = normalise_name(subdistrict)
    if not raw:
        raise AreaLookupError("ต้องระบุตำบล")

    row = _subdistricts.get(raw)
    if row is None:
        code = _subdistrict_by_name.get((district_code, raw))
        row = _subdistricts.get(code) if code else None

    if row is None:
        # Distinguish "no such tambon" from "that tambon is in another
        # amphoe". Both are refusals, but only the second tells the operator
        # what to fix, and picking a tambon from the wrong amphoe is the
        # mistake the filtered dropdown exists to prevent.
        elsewhere = [_subdistricts[c] for c in _subdistrict_names.get(raw, [])]
        if elsewhere:
            owners = ", ".join(sorted({_districts[r["district_code"]]["district_name"] for r in elsewhere}))
            raise AreaLookupError(
                "ตำบล " + repr(raw) + " ไม่ได้อยู่ในอำเภอ " + repr(district_row["district_name"])
                + " (อยู่ในอำเภอ " + owners + ")"
            )
        raise AreaLookupError("ไม่รู้จักตำบล " + repr(raw) + " (ต้องตรงกับชื่อหรือรหัสตำบลพอดี)")

    if row["district_code"] != district_code:
        # Reached when a tambon *code* from another amphoe is submitted.
        raise AreaLookupError(
            "ตำบล " + repr(row["subdistrict_name"]) + " ไม่ได้อยู่ในอำเภอ " + repr(district_row["district_name"])
            + " (อยู่ในอำเภอ " + _districts[row["district_code"]]["district_name"] + ")"
        )

    return AreaSnapshot(
        district_id=district_row["district_id"],
        district_code=district_code,
        district_name=district_row["district_name"],
        subdistrict_id=row["subdistrict_id"],
        subdistrict_code=row["subdistrict_code"],
        subdistrict_name=row["subdistrict_name"],
    )


# --- names for keys -----------------------------------------------------------


def district(district_id) -> Optional[dict]:
    """The amphoe row for a stored id, or None for an id the master file no
    longer has - a case is still served then, with blank area text."""
    try:
        return _districts.get(_district_code_by_id.get(int(district_id), ""))
    except (TypeError, ValueError):
        return None


def subdistrict(subdistrict_id) -> Optional[dict]:
    try:
        return _subdistricts.get(_subdistrict_code_by_id.get(int(subdistrict_id), ""))
    except (TypeError, ValueError):
        return None


def district_id_for_code(code: Optional[str]) -> Optional[int]:
    """For a filter that arrives as a code - the API speaks codes, the
    document stores ids. None for a code nobody has, which then matches
    nothing rather than everything."""
    row = _districts.get(str(code)) if code else None
    return row["district_id"] if row else None


def subdistrict_id_for_code(code: Optional[str]) -> Optional[int]:
    row = _subdistricts.get(str(code)) if code else None
    return row["subdistrict_id"] if row else None


def agents() -> list[dict]:
    """The roster, in roster order."""
    return list(_agents.values())


def agent(agent_id: Optional[str]) -> Optional[dict]:
    return _agents.get(str(agent_id)) if agent_id not in (None, "") else None


def channels() -> list[dict]:
    return [{"channel_id": channel_id, "channel_name": name} for channel_id, name in sorted(_channels.items())]


def channel_name(channel_id: Optional[int]) -> str:
    return _channels.get(int(channel_id), "") if channel_id is not None else ""


def resolve_agent(value) -> Optional[str]:
    """One operator's `agent_id`, from either the id or the exact roster name.

    Optional - the field is a convenience on the form, and a case with no
    operator recorded still saves. An unknown one is refused rather than
    stored as text: the id is all the case keeps.
    """
    if value is None:
        return None
    raw = normalise_name(value)
    if not raw:
        return None
    if raw in _agents:
        return raw
    agent_id = _agent_by_name.get(raw)
    if agent_id is None:
        raise FloodLookupError("ไม่รู้จักเจ้าหน้าที่ " + repr(raw))
    return agent_id


def resolve_channel(value) -> Optional[int]:
    """One `channel_id`, from the id, the channel's name, or one of the
    spellings in `CHANNEL_ALIASES`. Optional, like the agent."""
    if value is None:
        return None
    raw = normalise_name(value)
    if not raw:
        return None
    if raw.isdigit() and int(raw) in _channels:
        return int(raw)
    name = CHANNEL_ALIASES.get(raw) or CHANNEL_ALIASES.get(raw.lower()) or raw
    channel_id = _channel_by_name.get(name.lower())
    if channel_id is None:
        raise FloodLookupError("ไม่รู้จักช่องทาง " + repr(raw))
    return channel_id


# --- search support -----------------------------------------------------------
#
# Names are not on the document any more, so a search typed as a name has to
# become a set of keys first. Substring, case-insensitive, like the regex the
# text fields use, so "โคกโพธิ์" still finds a case the way it did.


def district_ids_matching(text: str) -> list[int]:
    needle = normalise_name(text).lower()
    return [row["district_id"] for row in _districts.values() if needle and needle in row["district_name"].lower()]


def subdistrict_ids_matching(text: str) -> list[int]:
    needle = normalise_name(text).lower()
    return [row["subdistrict_id"] for row in _subdistricts.values() if needle and needle in row["subdistrict_name"].lower()]


def agent_ids_matching(text: str) -> list[str]:
    needle = normalise_name(text).lower()
    return [agent_id for agent_id, row in _agents.items() if needle and needle in row["agent_name"].lower()]
