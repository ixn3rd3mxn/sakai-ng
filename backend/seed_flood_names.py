"""Seed the flood intake form's three suggestion lists from CSVs.

    cd backend
    python seed_flood_names.py                       # a1.csv, a2.csv, a3.csv at the repo root
    python seed_flood_names.py --check               # validate only, no writes
    python seed_flood_names.py --notifier x.csv --ddpm y.csv --crew z.csv

Each CSV is a two-column export - an id and a name:

    a1.csv  notifier_id, notifier_name  ->  flood_notifier
    a2.csv  ddpm_id,     ddpm_name      ->  flood_ddpm
    a3.csv  crew_id,     crew_name      ->  flood_crew

Safe to re-run: rows are upserted **by name**. There is no official code
here the way amphoe have one - the id is just the row number the export
generated - so the name is the only thing that identifies a row across two
exports. A renamed row therefore comes in as a new one and the old name is
left in place, reported but never deleted: cases already hold that text.

See `libs.flood_names` for why these are kept apart from the area lookups.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

from libs.configs import db
from libs.flood_lookups import normalise_name
from libs.flood_names import CREWS, DDPM_TEAMS, NOTIFIERS, NameList

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_FILES: dict[str, Path] = {
    "notifier": REPO_ROOT / "a1.csv",
    "ddpm": REPO_ROOT / "a2.csv",
    "crew": REPO_ROOT / "a3.csv",
}

SPECS: dict[str, NameList] = {
    "notifier": NOTIFIERS,
    "ddpm": DDPM_TEAMS,
    "crew": CREWS,
}


def _read_csv(path: Path, spec: NameList) -> list[dict]:
    """Read one list, failing loudly on a missing column, a blank cell or a
    duplicate name - a duplicate would be two dropdown rows the operator
    cannot tell apart."""
    if not path.exists():
        raise SystemExit("missing " + str(path))

    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = [c for c in (spec.id_field, spec.name_field) if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(path.name + ": missing column(s) " + ", ".join(missing))

        docs: list[dict] = []
        seen: set[str] = set()
        for line_no, raw in enumerate(reader, start=2):
            row_id = normalise_name(raw.get(spec.id_field) or "")
            name = normalise_name(raw.get(spec.name_field) or "")
            if not row_id or not name:
                raise SystemExit(path.name + " line " + str(line_no) + ": blank id or name")
            if not row_id.isdigit():
                raise SystemExit(path.name + " line " + str(line_no) + ": id " + repr(row_id) + " is not a number")
            if name in seen:
                raise SystemExit(path.name + " line " + str(line_no) + ": duplicate name " + repr(name))
            seen.add(name)
            docs.append({spec.id_field: int(row_id), spec.name_field: name})

    return docs


def _upsert(spec: NameList, docs: list[dict]) -> tuple[int, int]:
    db[spec.collection].create_index(spec.name_field, unique=True)
    inserted = updated = 0
    for doc in docs:
        result = db[spec.collection].update_one({spec.name_field: doc[spec.name_field]}, {"$set": doc}, upsert=True)
        if result.upserted_id is not None:
            inserted += 1
        elif result.modified_count:
            updated += 1
    return inserted, updated


def _report_extra(spec: NameList, docs: list[dict]) -> None:
    in_file = {d[spec.name_field] for d in docs}
    extra = sorted(
        str(row[spec.name_field])
        for row in db[spec.collection].find({}, {spec.name_field: 1, "_id": 0})
        if row.get(spec.name_field) not in in_file
    )
    if extra:
        print("  in the database but not in the file (left alone): " + ", ".join(extra))


def _parse_args(argv: list[str]) -> tuple[bool, dict[str, Path]]:
    files = dict(DEFAULT_FILES)
    check_only = False
    args = iter(argv[1:])
    for arg in args:
        if arg == "--check":
            check_only = True
        elif arg.startswith("--") and arg[2:] in files:
            try:
                files[arg[2:]] = Path(next(args))
            except StopIteration:
                raise SystemExit(arg + " needs a path")
        else:
            raise SystemExit("unknown argument " + repr(arg) + "; see the module docstring")
    return check_only, files


def main(argv: list[str]) -> int:
    check_only, files = _parse_args(argv)

    for key, spec in SPECS.items():
        docs = _read_csv(files[key], spec)
        if check_only:
            print(files[key].name + " is valid: " + str(len(docs)) + " " + spec.collection + " row(s)")
            continue
        inserted, updated = _upsert(spec, docs)
        print(spec.collection + ": " + str(inserted) + " inserted, " + str(updated) + " updated, "
              + str(db[spec.collection].count_documents({})) + " in the database")
        _report_extra(spec, docs)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
