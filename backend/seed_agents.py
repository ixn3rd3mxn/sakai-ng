"""Seed the `agents` collection: agent_extension -> staff name.

Run once, then maintain from the จัดการข้อมูล page. Extensions not listed here
still appear on the board - they render with the extension in place of the
name - so a missing row degrades rather than hiding an on-duty agent.

    python seed_agents.py

Only the extension and name are stored. The upstream feed also carries
`agent_username`, a Thai national ID; it is deliberately not persisted.
"""

from libs.configs import db

# Replace with your real roster. The five below are the names visible on the
# official dashboard screenshot; the on-duty roster rotates each shift, so the
# mapping needs every member of staff, not just one shift's worth.
AGENTS = [
    {"agent_extension": "94005", "name": "นิฮานาน"},
    {"agent_extension": "94009", "name": "จริณ"},
    {"agent_extension": "94013", "name": "บูรไอนี"},
    {"agent_extension": "94015", "name": "อาสมะ"},
    {"agent_extension": "94017", "name": "ฮาลีเม๊าะ"},
]

if __name__ == "__main__":
    db.agents.create_index("agent_extension", unique=True)
    for agent in AGENTS:
        db.agents.update_one(
            {"agent_extension": agent["agent_extension"]},
            {"$set": agent},
            upsert=True,
        )
    print(f"{db.agents.count_documents({})} agent name(s) in the collection")
