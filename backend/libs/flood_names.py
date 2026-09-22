"""The three free-text suggestion lists on the flood intake form.

    flood_notifier   ผู้แจ้ง                who called
    flood_ddpm       ประสานงานทีม ปภ.อำเภอ  which DDPM team was coordinated with
    flood_crew       หน่วยปฏิบัติ            which unit went out

Each is a flat list of names, seeded from a spreadsheet column by
`seed_flood_names.py`. They are suggestions, not validation: the fields on
the case stay free text, and a value that is not on the list is stored as
typed. So unlike `flood_lookups`, nothing here is cached or required - a
list that cannot be read costs the operator a dropdown, never a case.
"""

from __future__ import annotations

from dataclasses import dataclass

from libs.configs import db


@dataclass(frozen=True)
class NameList:
    collection: str
    id_field: str
    name_field: str


NOTIFIERS = NameList("flood_notifier", "notifier_id", "notifier_name")
DDPM_TEAMS = NameList("flood_ddpm", "ddpm_id", "ddpm_name")
CREWS = NameList("flood_crew", "crew_id", "crew_name")

ALL: tuple[NameList, ...] = (NOTIFIERS, DDPM_TEAMS, CREWS)


def names(spec: NameList) -> list[str]:
    """Every name in the list, in spreadsheet order.

    The id is the source row number, and the spreadsheet is kept in the order
    the operators are used to reading it, so that is the order offered.
    Raises `PyMongoError` like any read; the caller decides what a missing
    list is worth.
    """
    rows = db[spec.collection].find({}, {spec.id_field: 1, spec.name_field: 1, "_id": 0})
    return [
        str(row[spec.name_field])
        for row in sorted(rows, key=lambda r: int(r.get(spec.id_field) or 0))
        if row.get(spec.name_field)
    ]
