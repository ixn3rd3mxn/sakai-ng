"""Seed the `agents` collection: agent_extension -> staff name.

    cd backend
    python seed_agents.py            # write the mapping below
    python seed_agents.py --check    # report only, no writes

Safe to re-run: every row is an upsert keyed on the extension, so running it
twice changes nothing and running it after an edit updates just what changed.

Only the extension and the name are stored. The upstream feed also carries
`agent_username`, a Thai national ID; it is deliberately never persisted, so
no PDPA-relevant identifier reaches this database.

A missing name is not fatal - the board shows the extension in its place and
the agent still appears. Nobody vanishes for want of a row here.
"""

from __future__ import annotations

import sys

from libs.configs import db

# ---------------------------------------------------------------------------
# The roster.
#
# Fill this in from your own staff list. The five names below are the ones
# visible on the official dashboard screenshot; every other extension was seen
# signed in during development but its name is unknown here.
#
# The on-duty roster rotates every shift - three samples across two days shared
# almost no extensions - so this needs *every* member of staff at the branch,
# not the handful signed in when you happen to run it.
# ---------------------------------------------------------------------------
AGENTS: list[dict[str, str]] = [
    # --- names known from the official dashboard ---
    {"agent_extension": "94018", "name": "ฟาซีรา"},
    {"agent_extension": "94017", "name": "ฮาลีเม๊าะ"},
    {"agent_extension": "94015", "name": "อาสมะ"},
    {"agent_extension": "94016", "name": "อัสรินดาร์"},
    {"agent_extension": "94014", "name": "ฟาดีละห์"},
    {"agent_extension": "94005", "name": "นิฮานาน"},
    {"agent_extension": "94004", "name": "เจะรอฮานี"},
    {"agent_extension": "94007", "name": "รวิภา"},
    {"agent_extension": "94011", "name": "อุษา"},
    {"agent_extension": "94010", "name": "สุไรยา"},
    {"agent_extension": "94012", "name": "ปาตีเมาะ"},
    {"agent_extension": "94013", "name": "นูรไอนี"},
    {"agent_extension": "94008", "name": "วันศายนนท์"},
    {"agent_extension": "94009", "name": "จริณ"},
    {"agent_extension": "94020", "name": "ปองภพ"},
    {"agent_extension": "94021", "name": "รอฝาด"},
    {"agent_extension": "94023", "name": "รอฮัมดี"},
    {"agent_extension": "94019", "name": "ประสิทธิ์"},
    {"agent_extension": "94024", "name": "แวบูราฮัน"}

    # --- seen on the live feed, names needed ---
    # Uncomment and fill each one in. Left commented they are simply absent,
    # and the board falls back to showing the extension.
    # {"agent_extension": "94004", "name": ""},   # supervisor
    # {"agent_extension": "94011", "name": ""},   # supervisor
    # {"agent_extension": "94014", "name": ""},
    # {"agent_extension": "94016", "name": ""},
    # {"agent_extension": "94018", "name": ""},
    # {"agent_extension": "94020", "name": ""},
    # {"agent_extension": "94023", "name": ""},
    #
    # 94501-94505 are unmanned spare desks (username "EXT_945xx", not a
    # person). They are filtered out server-side and need no names.
]


def _report() -> None:
    stored = {d["agent_extension"]: d.get("name") for d in db.agents.find({}, {"_id": 0})}
    print(f"{len(stored)} name(s) currently in the collection")

    missing = [a["agent_extension"] for a in AGENTS if not a.get("name")]
    if missing:
        print(f"blank name(s) in this file, will be skipped: {', '.join(missing)}")

    try:
        import httpx

        from libs import agents as agents_lib

        body = httpx.get(agents_lib.AGENTS_URL.format(branch=agents_lib.BRANCH_ID), timeout=20).json()
        on_duty = {
            r["agent_extension"]
            for r in body.get("data", [])
            if r.get("agent_type_id") in agents_lib.ROLES
            and not str(r.get("agent_username", "")).startswith("EXT_")
        }
    except Exception as exc:  # the report is a convenience, never a blocker
        print(f"(could not read the live feed to cross-check: {exc})")
        return

    unnamed = sorted(e for e in on_duty if not stored.get(e))
    print(f"on duty right now: {', '.join(sorted(on_duty)) or 'nobody'}")
    if unnamed:
        print(f"on duty WITHOUT a name (will show as an extension): {', '.join(unnamed)}")
    else:
        print("every agent on duty has a name")


def main() -> int:
    check_only = "--check" in sys.argv

    if not check_only:
        writable = [a for a in AGENTS if a.get("name")]
        db.agents.create_index("agent_extension", unique=True)
        for agent in writable:
            db.agents.update_one(
                {"agent_extension": agent["agent_extension"]},
                {"$set": {"agent_extension": agent["agent_extension"], "name": agent["name"]}},
                upsert=True,
            )
        print(f"wrote {len(writable)} name(s)")

    _report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
