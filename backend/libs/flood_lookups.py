"""In-memory cache of the flood-response area master data (`flood_district`,
`flood_subdistrict`) plus strict resolution of the names/codes an incoming
request carries into the four snapshot fields stored on a `flood_cases`
document.

Deliberately kept out of `libs.lookups`. That module is loaded once at
startup and `main._require_lookups` turns any failure to populate it into a
503 on *every* reference-backed endpoint - which is all three EMS report
pages. Folding two more collections into `lookups.load()` would mean a slow
or broken flood seed takes those dashboards down with it, so this module
loads on its own, fails on its own, and nothing in `lookups` can reach it.

The cache is tiny and effectively static (12 districts, 115 subdistricts, and
only when the ministry redraws a boundary), so it is read once rather than
joined against Mongo on every case write or duplicate check - and the
duplicate check runs on nearly every keystroke of a phone number.
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


class AreaLookupError(ValueError):
    """An area could not be resolved to exactly one record.

    Carries a message meant to be shown to the caller: a case records where a
    boat was actually sent, so refusing an ambiguous or unknown area is the
    whole point - see `resolve_district`.
    """


@dataclass(frozen=True)
class AreaSnapshot:
    """The four area fields copied onto a `flood_cases` document.

    Both the code and the name are stored, never an id alone. `district_id` /
    `subdistrict_id` are row numbers from the source CSV and shift if the file
    is ever re-ordered; the official codes do not. And a name resolved today
    must still read correctly on a case from last November even if the record
    is later renamed - a historical record that silently re-reads through a
    changed lookup is wrong in a way nobody notices.
    """

    district_code: str
    district_name: str
    subdistrict_code: str
    subdistrict_name: str

    def to_fields(self) -> dict[str, str]:
        return {
            "district_code": self.district_code,
            "district_name": self.district_name,
            "subdistrict_code": self.subdistrict_code,
            "subdistrict_name": self.subdistrict_name,
        }


# code -> {"district_id", "district_code", "district_name"}
_districts: dict[str, dict] = {}
# code -> {"subdistrict_id", "district_id", "district_code",
#          "subdistrict_code", "subdistrict_name"}
_subdistricts: dict[str, dict] = {}
# normalised name -> district code
_district_by_name: dict[str, str] = {}
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
        install(districts, subdistricts)
        _loaded = True


def install(districts: list[dict], subdistricts: list[dict]) -> None:
    """Build the indexes from plain dicts.

    Split out from the Mongo read so the resolution rules - the part that has
    to be right - are testable without a database.
    """
    _districts.clear()
    _subdistricts.clear()
    _district_by_name.clear()
    _subdistrict_by_name.clear()
    _subdistrict_names.clear()

    for doc in districts:
        code = str(doc["district_code"])
        name = normalise_name(doc["district_name"])
        _districts[code] = {
            "district_id": int(doc["district_id"]),
            "district_code": code,
            "district_name": name,
        }
        _district_by_name[name] = code

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
        district_code=district_code,
        district_name=district_row["district_name"],
        subdistrict_code=row["subdistrict_code"],
        subdistrict_name=row["subdistrict_name"],
    )
