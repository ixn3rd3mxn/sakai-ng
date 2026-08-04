"""
EMS Database Schema Exporter
------------------------------
Exports the schema of a MongoDB database to a Markdown (.md) file,
suitable for feeding into an AI assistant (e.g. "AI Vibe") so it can
understand the database structure.
"""

from pymongo import MongoClient
from datetime import datetime

# =========================================================
# Config / Helper data (edit these to fit your project)
# =========================================================

COLLECTION_DESCRIPTIONS = {
    "call_types": "ประเภทการแจ้งเหตุ (Call Types)",
    "reporting_channels": "ช่องทางการแจ้ง (Reporting Channels)",
    "case_types": "ประเภทเคส (Case Types)",
    "cbd_categories": "CBD Categories (Chief Complaint Based Dispatch)",
    "severity_levels": "ระดับความรุนแรง (Severity Levels)",
    "incidents": "ข้อมูลเหตุการณ์ฉุกเฉิน (Incidents)",
}

# Optional: per-collection, per-field descriptions.
# Add entries here as you document more fields.
FIELD_DESCRIPTIONS = {
    "incidents": {
        "_id": "MongoDB primary key",
        "case_id": "รหัสเคสอ้างอิง",
    },
}

# Number of sample documents to inspect per collection when
# building the field list (helps catch fields that don't appear
# in every document).
SAMPLE_SIZE = 20


def get_description(collection_name: str) -> str:
    """Return a human-readable description for a collection."""
    return COLLECTION_DESCRIPTIONS.get(collection_name, "No description")


def get_field_description(collection_name: str, field_name: str) -> str:
    """Return a human-readable description for a specific field, if any."""
    return FIELD_DESCRIPTIONS.get(collection_name, {}).get(field_name, "")


def collect_fields(collection, sample_size: int = SAMPLE_SIZE) -> dict:
    """
    Sample multiple documents and union their fields/types together,
    instead of relying on a single find_one() call. This catches
    fields that only appear in some documents.

    Returns a dict: {field_name: set_of_type_names}
    """
    fields = {}
    cursor = collection.find().limit(sample_size)
    for doc in cursor:
        for field, value in doc.items():
            type_name = type(value).__name__
            fields.setdefault(field, set()).add(type_name)
    return fields


def build_markdown(db) -> str:
    collection_names = sorted(db.list_collection_names())

    markdown = f"""# 📊 EMS Database Schema
*Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}*

---

## 📋 Collections Overview

| **Collection** | **Description** | **Fields Count** | **Doc Count** |
|---------------|----------------|------------------|----------------|
"""

    # Cache field info + counts so we don't query twice
    collection_fields = {}
    collection_counts = {}

    for name in collection_names:
        collection = db[name]
        fields = collect_fields(collection)
        count = collection.estimated_document_count()
        collection_fields[name] = fields
        collection_counts[name] = count
        markdown += (
            f"| `{name}` | {get_description(name)} | {len(fields)} | {count} |\n"
        )

    markdown += "\n---\n\n"

    for name in collection_names:
        collection = db[name]
        fields = collection_fields[name]
        indexes = collection.index_information()

        markdown += f"## 📄 `{name}`\n\n"
        markdown += f"*{get_description(name)} — {collection_counts[name]} documents*\n\n"

        markdown += "| **Field** | **Type(s)** | **Description** |\n"
        markdown += "|----------|-------------|----------------|\n"

        if fields:
            for field in sorted(fields.keys()):
                type_str = ", ".join(sorted(fields[field]))
                desc = get_field_description(name, field)
                markdown += f"| `{field}` | {type_str} | {desc} |\n"
        else:
            markdown += "| *(collection empty — no documents to sample)* | | |\n"

        markdown += "\n**🔍 Indexes:**\n"
        non_default_indexes = {
            k: v for k, v in indexes.items() if k != "_id_"
        }
        if non_default_indexes:
            for index_name, index_info in non_default_indexes.items():
                keys = ", ".join(f"`{k}`" for k, _ in index_info["key"])
                markdown += f"- `{index_name}`: ({keys})\n"
        else:
            markdown += "- *(no secondary indexes)*\n"

        markdown += "\n---\n\n"

    return markdown


def main():
    # เชื่อมต่อ MongoDB
    client = MongoClient("mongodb://localhost:27017/")
    db = client.ems_dashboard

    markdown = build_markdown(db)

    filename = f"ems_dashboard_schema_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(markdown)

    print(f"✅ Export Markdown เสร็จ! → {filename}")


if __name__ == "__main__":
    main()