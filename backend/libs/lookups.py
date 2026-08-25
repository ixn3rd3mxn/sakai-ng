"""In-memory cache of the small reference collections (call_types,
case_types, cbd_categories, reporting_channels, severity_levels) plus
helpers to resolve names/codes coming from incoming requests into the ids
stored on `incidents` documents.

These collections rarely change and are tiny (<=25 docs), so we load them
once at startup instead of joining against Mongo on every aggregation.
"""

from __future__ import annotations

import re
from typing import Optional

from libs.configs import db

_call_types: dict[int, str] = {}
_case_types: dict[int, str] = {}
_cbd_categories: dict[int, dict] = {}  # id -> {"name": "CBD1", "des": "..."}
_reporting_channels: dict[int, str] = {}
_severity_levels: dict[int, dict] = {}  # id -> {"name": "แดง", "des": "..."}

# Frontend "call type" options carry a stable code, independent of DB call_id
# ordering. Names below must match `call_types.call_name` exactly.
CALL_CODE_TO_NAME: dict[str, str] = {
    "NY": "แจ้งเหตุ",
    "RM": "แจ้งซ้ำเหตุเดิม",
    "LDN": "ปรึกษา",
    "IST": "สายหลุด",
    "PRS": "ก่อกวน",
}


def load() -> None:
    """(Re)load all reference collections into memory."""
    _call_types.clear()
    _case_types.clear()
    _cbd_categories.clear()
    _reporting_channels.clear()
    _severity_levels.clear()

    for doc in db.call_types.find():
        _call_types[doc["call_id"]] = doc["call_name"]
    for doc in db.case_types.find():
        _case_types[doc["case_id"]] = doc["case_name"]
    for doc in db.cbd_categories.find():
        _cbd_categories[doc["cbd_id"]] = {
            "name": doc["cbd_name"],
            "des": doc.get("cbd_des", ""),
        }
    for doc in db.reporting_channels.find():
        _reporting_channels[doc["channel_id"]] = doc["channel_name"]
    for doc in db.severity_levels.find():
        _severity_levels[doc["severity_id"]] = {
            "name": doc["severity_name"],
            "des": doc.get("severity_des", ""),
        }


def call_types() -> dict[int, str]:
    return _call_types


def case_types() -> dict[int, str]:
    return _case_types


def cbd_categories() -> dict[int, dict]:
    return _cbd_categories


def reporting_channels() -> dict[int, str]:
    return _reporting_channels


def severity_levels() -> dict[int, dict]:
    return _severity_levels


# ---- name lookups used when rendering incidents ----------------------


def call_name(call_id: Optional[int]) -> str:
    if call_id is None:
        return "-"
    return _call_types.get(call_id, "-")


def case_name(case_id: Optional[int]) -> str:
    if case_id is None:
        return "-"
    return _case_types.get(case_id, "-")


def channel_name(channel_id: Optional[int]) -> str:
    if channel_id is None:
        return "-"
    return _reporting_channels.get(channel_id, "-")


def cbd_label(cbd_id: Optional[int]) -> str:
    if cbd_id is None:
        return "-"
    item = _cbd_categories.get(cbd_id)
    if not item:
        return "-"
    return f"{item['name']} {item['des']}".strip()


def cbd_name(cbd_id: Optional[int]) -> str:
    """Short code only (e.g. "CBD5"), unlike `cbd_label` which appends the
    description - used where the UI shows/filters on the code alone."""
    if cbd_id is None:
        return "-"
    item = _cbd_categories.get(cbd_id)
    return item["name"] if item else "-"


def severity_name(severity_id: Optional[int]) -> str:
    if severity_id is None:
        return "-"
    item = _severity_levels.get(severity_id)
    return item["name"] if item else "-"


# ---- resolution used when creating a new incident ----------------------


def resolve_call_id(code: str) -> Optional[int]:
    name = CALL_CODE_TO_NAME.get(code)
    if name is None:
        return None
    for call_id, call_name_ in _call_types.items():
        if call_name_ == name:
            return call_id
    return None


def resolve_case_id(name: str) -> Optional[int]:
    target = name.strip().lower()
    for case_id, case_name_ in _case_types.items():
        if case_name_.strip().lower() == target:
            return case_id
    return None


def resolve_channel_id(name: str) -> Optional[int]:
    target = name.strip().lower()
    for channel_id, channel_name_ in _reporting_channels.items():
        if channel_name_.strip().lower() == target:
            return channel_id
    return None


_CBD_ID_RE = re.compile(r"CBD\s*(\d+)", re.IGNORECASE)


def resolve_cbd_id(text: str) -> Optional[int]:
    """The frontend sends the full "CBD1 ปวดท้อง..." label; the leading
    "CBD<n>" token is enough to identify the record."""
    match = _CBD_ID_RE.search(text)
    if not match:
        return None
    cbd_id = int(match.group(1))
    return cbd_id if cbd_id in _cbd_categories else None


_SEVERITY_ID_RE = re.compile(r"ระดับที่\s*(\d+)")


def resolve_severity_id(text: str) -> Optional[int]:
    """The frontend sends the full "ระดับที่ 1 สีแดง..." label; the leading
    number is enough to identify the record."""
    match = _SEVERITY_ID_RE.search(text)
    if not match:
        return None
    severity_id = int(match.group(1))
    return severity_id if severity_id in _severity_levels else None
