"""Seed the `agents` collection: agent_extension -> staff name.

    cd backend
    python seed_agents.py            # write the mapping below
    python seed_agents.py --check    # report only, no writes

Safe to re-run: every row is an upsert keyed on the extension, so running it
twice changes nothing and running it after an edit updates just what changed.

Only `agent_id`, `agent_extension` and `agent_name` are stored. The upstream
feed also carries `agent_username`, a Thai national ID; it is deliberately
never persisted, so no PDPA-relevant identifier reaches this database.

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
    {"agent_id": "1", "agent_extension": "94008", "agent_name": "วันศายนนท์ ฮัจญีย์เราะห์อีส"},
    {"agent_id": "2", "agent_extension": "94004", "agent_name": "เจะรอฮานี วันหวัง"},
    {"agent_id": "3", "agent_extension": "94007", "agent_name": "รวิภา บุญณฤมิตร"},
    {"agent_id": "4", "agent_extension": "94005", "agent_name": "นิฮานาน วาแม"},
    {"agent_id": "5", "agent_extension": "94011", "agent_name": "อุษา มือสันทัด"},
    {"agent_id": "6", "agent_extension": "94010", "agent_name": "สุไรยา มะลี"},
    {"agent_id": "7", "agent_extension": "94012", "agent_name": "ปาตีเมาะ หะยีสะอุ"},
    {"agent_id": "8", "agent_extension": "94013", "agent_name": "นูรไอนี ช่อสามารถ"},
    {"agent_id": "9", "agent_extension": "94014", "agent_name": "ฟาดีละห์ วาเด็ง"},
    {"agent_id": "10", "agent_extension": "94015", "agent_name": "อาสมะ ลาเตะ"},
    {"agent_id": "11", "agent_extension": "94016", "agent_name": "อัสรินดาร์ แก่ต่อง"},
    {"agent_id": "12", "agent_extension": "94017", "agent_name": "ฮาลีเม๊าะ มะนุ"},
    {"agent_id": "13", "agent_extension": "94018", "agent_name": "ฟาซีรา มาน๊ะ"},
    {"agent_id": "14", "agent_extension": "94009", "agent_name": "จริณ คงทน"},
    {"agent_id": "15", "agent_extension": "94020", "agent_name": "ปองภพ ขีปนานนท์"},
    {"agent_id": "16", "agent_extension": "94021", "agent_name": "รอฝาด มะสัน"},
    {"agent_id": "17", "agent_extension": "94023", "agent_name": "รอฮัมดี อาบู"},
    {"agent_id": "18", "agent_extension": "94019", "agent_name": "ประสิทธิ์ ราชหุ่น"},
    {"agent_id": "19", "agent_extension": "94024", "agent_name": "แวบูราฮัน โตะแวเด็ง"}

    # --- seen on the live feed, names needed ---
    # Uncomment and fill each one in. Left commented they are simply absent,
    # and the board falls back to showing the extension.
    # {"agent_id": "", "agent_extension": "94004", "agent_name": ""},   # supervisor
    # {"agent_id": "", "agent_extension": "94011", "agent_name": ""},   # supervisor
    # {"agent_id": "", "agent_extension": "94014", "agent_name": ""},
    # {"agent_id": "", "agent_extension": "94016", "agent_name": ""},
    # {"agent_id": "", "agent_extension": "94018", "agent_name": ""},
    # {"agent_id": "", "agent_extension": "94020", "agent_name": ""},
    # {"agent_id": "", "agent_extension": "94023", "agent_name": ""},
    #
    # 94501-94505 are unmanned spare desks (username "EXT_945xx", not a
    # person). They are filtered out server-side and need no names.
]


def _report() -> None:
    stored = {d["agent_extension"]: d.get("agent_name") for d in db.agents.find({}, {"_id": 0})}
    print(f"{len(stored)} name(s) currently in the collection")

    missing = [a["agent_extension"] for a in AGENTS if not a.get("agent_name")]
    if missing:
        print(f"blank name(s) in this file, will be skipped: {', '.join(missing)}")

    try:
        import httpx

        from libs import agents as agents_lib

        body = httpx.get(agents_lib.AGENTS_URL, timeout=20).json()
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
        writable = [a for a in AGENTS if a.get("agent_name")]
        db.agents.create_index("agent_extension", unique=True)
        for agent in writable:
            db.agents.update_one(
                {"agent_extension": agent["agent_extension"]},
                {
                    "$set": {
                        "agent_id": agent["agent_id"],
                        "agent_extension": agent["agent_extension"],
                        "agent_name": agent["agent_name"],
                    },
                    # Left over from the schema before `agent_name`; dropped so
                    # a re-run cleans the old field out instead of leaving two
                    # names on the row.
                    "$unset": {"name": ""},
                },
                upsert=True,
            )
        print(f"wrote {len(writable)} name(s)")

    _report()
    return 0


if __name__ == "__main__":
    sys.exit(main())
