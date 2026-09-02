"""Seed the flood-response area master data from the two CSVs at the repo root.

    cd backend
    python seed_flood_areas.py            # upsert both collections + indexes
    python seed_flood_areas.py --check    # report only, no writes

Safe to re-run: every row is an upsert **keyed on the official code**
(`district_code` / `subdistrict_code`), never on `district_id` /
`subdistrict_id`. Those two are row numbers generated when the CSV was
exported - re-export the file in a different order and every id shifts, which
would make an id-keyed upsert rewrite the whole collection and silently
re-point existing rows. Government area codes do not move.

The collections are prefixed `flood_` on purpose. This database already holds
the EMS collections (`incidents`, `call_types`, `cbd_categories`, `agents`);
a bare `district` would give no clue which feature owns it.

Nothing here touches `agents` or any EMS collection, and nothing here is
loaded by `libs.lookups` - see the module docstring of `libs.flood_lookups`
for why that separation matters.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from libs.configs import db
from libs.flood_lookups import DISTRICT_COLLECTION, SUBDISTRICT_COLLECTION, normalise_name

# The CSVs live at the repo root, one level above this script.
REPO_ROOT = Path(__file__).resolve().parent.parent
DISTRICT_CSV = REPO_ROOT / "district.csv"
SUBDISTRICT_CSV = REPO_ROOT / "subdistrict.csv"


def _read_csv(path: Path, columns: tuple[str, ...]) -> list[dict[str, str]]:
    """Read a CSV, failing loudly on a missing column or a blank cell.

    A half-populated area table is worse than none: a tambon with no code
    cannot be upserted by code, and one with no name reaches the operator's
    dropdown as an empty row they cannot tell apart from any other.
    """
    if not path.exists():
        raise SystemExit("missing " + str(path))

    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [c for c in columns if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(str(path.name) + ": missing column(s) " + ", ".join(missing))

        rows: list[dict[str, str]] = []
        for line_no, raw in enumerate(reader, start=2):
            row = {c: normalise_name(raw.get(c) or "") for c in columns}
            blank = [c for c, v in row.items() if not v]
            if blank:
                raise SystemExit(str(path.name) + " line " + str(line_no) + ": blank " + ", ".join(blank))
            rows.append(row)

    return rows


def _load_rows() -> tuple[list[dict], list[dict]]:
    districts = _read_csv(DISTRICT_CSV, ("district_id", "district_code", "district_name"))
    subdistricts = _read_csv(
        SUBDISTRICT_CSV, ("subdistrict_id", "district_id", "subdistrict_code", "subdistrict_name")
    )

    district_docs = [
        {
            "district_id": int(r["district_id"]),
            "district_code": r["district_code"],
            "district_name": r["district_name"],
        }
        for r in districts
    ]
    subdistrict_docs = [
        {
            "subdistrict_id": int(r["subdistrict_id"]),
            "district_id": int(r["district_id"]),
            "subdistrict_code": r["subdistrict_code"],
            "subdistrict_name": r["subdistrict_name"],
        }
        for r in subdistricts
    ]

    _validate(district_docs, subdistrict_docs)
    return district_docs, subdistrict_docs


def _validate(districts: list[dict], subdistricts: list[dict]) -> None:
    """Refuse a file set that would produce an unusable lookup.

    Checked here rather than at load time because this is the only moment a
    human is watching: `flood_lookups` runs inside a request and can only drop
    a bad row and log, which nobody reads during a flood.
    """
    codes = [d["district_code"] for d in districts]
    if len(set(codes)) != len(codes):
        raise SystemExit("district.csv: duplicate district_code")

    sub_codes = [s["subdistrict_code"] for s in subdistricts]
    if len(set(sub_codes)) != len(sub_codes):
        raise SystemExit("subdistrict.csv: duplicate subdistrict_code")

    known_ids = {d["district_id"] for d in districts}
    orphans = sorted({s["subdistrict_code"] for s in subdistricts if s["district_id"] not in known_ids})
    if orphans:
        raise SystemExit("subdistrict.csv: district_id not in district.csv for " + ", ".join(orphans))

    # A tambon is chosen from a dropdown already filtered to one amphoe, and
    # resolved by (amphoe, name). Two identically named tambon in the same
    # amphoe would make that pair ambiguous, so the operator could pick a row
    # the server then cannot identify.
    seen: set[tuple[int, str]] = set()
    for s in subdistricts:
        key = (s["district_id"], s["subdistrict_name"])
        if key in seen:
            raise SystemExit("subdistrict.csv: duplicate name " + repr(s["subdistrict_name"]) + " within one district")
        seen.add(key)


def _ensure_indexes() -> None:
    """Unique on the official code, so a re-run cannot double-insert even if
    the upsert key were ever changed by mistake."""
    db[DISTRICT_COLLECTION].create_index("district_code", unique=True)
    db[SUBDISTRICT_COLLECTION].create_index("subdistrict_code", unique=True)
    # The dropdown is always narrowed by amphoe, so this is the only read
    # pattern the tambon collection has.
    db[SUBDISTRICT_COLLECTION].create_index("district_id")


def _upsert(collection: str, key: str, docs: list[dict]) -> tuple[int, int]:
    inserted = updated = 0
    for doc in docs:
        result = db[collection].update_one({key: doc[key]}, {"$set": doc}, upsert=True)
        if result.upserted_id is not None:
            inserted += 1
        elif result.modified_count:
            updated += 1
    return inserted, updated


def _report(districts: list[dict], subdistricts: list[dict]) -> None:
    stored_d = db[DISTRICT_COLLECTION].count_documents({})
    stored_s = db[SUBDISTRICT_COLLECTION].count_documents({})
    print(str(stored_d) + " district(s), " + str(stored_s) + " subdistrict(s) in the database")
    print("the CSVs hold " + str(len(districts)) + " district(s), " + str(len(subdistricts)) + " subdistrict(s)")

    # Rows in the database but not in the files are reported, never deleted: a
    # code that disappears from an export is far more likely to be a truncated
    # file than a dissolved amphoe, and cases already reference these names.
    file_codes = {d["district_code"] for d in districts}
    extra = sorted(
        d["district_code"] for d in db[DISTRICT_COLLECTION].find({}, {"district_code": 1, "_id": 0})
        if d.get("district_code") not in file_codes
    )
    if extra:
        print("in the database but not in district.csv (left alone): " + ", ".join(extra))

    file_sub_codes = {s["subdistrict_code"] for s in subdistricts}
    extra_sub = sorted(
        s["subdistrict_code"] for s in db[SUBDISTRICT_COLLECTION].find({}, {"subdistrict_code": 1, "_id": 0})
        if s.get("subdistrict_code") not in file_sub_codes
    )
    if extra_sub:
        print("in the database but not in subdistrict.csv (left alone): " + ", ".join(extra_sub))


def main(argv: list[str]) -> int:
    check_only = "--check" in argv
    districts, subdistricts = _load_rows()

    if check_only:
        print("CSVs are valid: " + str(len(districts)) + " district(s), " + str(len(subdistricts)) + " subdistrict(s)")
    else:
        _ensure_indexes()
        d_ins, d_upd = _upsert(DISTRICT_COLLECTION, "district_code", districts)
        s_ins, s_upd = _upsert(SUBDISTRICT_COLLECTION, "subdistrict_code", subdistricts)
        print(DISTRICT_COLLECTION + ": " + str(d_ins) + " inserted, " + str(d_upd) + " updated")
        print(SUBDISTRICT_COLLECTION + ": " + str(s_ins) + " inserted, " + str(s_upd) + " updated")
        if not (d_ins or d_upd or s_ins or s_upd):
            print("(nothing changed - the database already matches the CSVs)")

    _report(districts, subdistricts)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
