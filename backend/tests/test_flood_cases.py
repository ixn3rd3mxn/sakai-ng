"""Offline tests for the flood intake data layer.

No database and no network: `flood_lookups.install` takes the master tables
as plain dicts precisely so the resolution rules - the part that decides what
gets written to a dispatch record - can be exercised directly.

What is being protected here, each one written against a specific way this
could go wrong:

- **An ambiguous amphoe is refused, never guessed.** "เมือง" is a unique
  prefix of "เมืองปัตตานี" today and would resolve happily; it stops being
  unique the moment the master file grows, and by then the wrong-amphoe cases
  are already stored.
- **A tambon is resolved inside its amphoe, not globally.** The dropdown is
  filtered client-side, but the client is not what decides what is stored.
- **Two spellings of one phone number compare equal.** The duplicate check is
  the whole reason this page exists; "083-1869048" and "0831869048" reaching
  it as different numbers would silently disable it.
- **A blank age or sex still saves.** The spreadsheet has real rows with both
  empty, because the caller hung up.
- **A case stores keys, and reads them back as codes and names.**
  `agent_id`, `channel_id`, `district_id` and `subdistrict_id` are all the
  document holds; every code and name the table shows is a cache lookup, and
  a name typed into the search box is turned into keys before the query.
- **No sequence number is ever stored.** "ลำดับ" is counted at render time
  from the current filter; a stored one would collide the moment two
  operators saved at once, which during a flood is constant.
- **The shift default comes from `libs.shift`.** Re-deriving the 08:30
  boundary here would let the two drift apart unnoticed.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timedelta

from tests import helpers  # noqa: F401  (path + dummy MONGO_URI, must precede libs)

from libs import flood_cases as fc
from libs import flood_lookups as fl
from libs.shift import get_shift

# A slice of the real master data: three amphoe, enough tambon to cover every
# sample row and to put an identical-looking choice in the wrong amphoe.
DISTRICTS = [
    {"district_id": 1, "district_code": "9401", "district_name": "เมืองปัตตานี"},
    {"district_id": 2, "district_code": "9402", "district_name": "โคกโพธิ์"},
    {"district_id": 6, "district_code": "9406", "district_name": "ทุ่งยางแดง"},
]
SUBDISTRICTS = [
    {"subdistrict_id": 2, "district_id": 1, "subdistrict_code": "940106", "subdistrict_name": "คลองมานิง"},
    {"subdistrict_id": 11, "district_id": 1, "subdistrict_code": "940110", "subdistrict_name": "รูสะมิแล"},
    {"subdistrict_id": 23, "district_id": 2, "subdistrict_code": "940207", "subdistrict_name": "ปากล่อ"},
    {"subdistrict_id": 63, "district_id": 6, "subdistrict_code": "940604", "subdistrict_name": "ปากู"},
]
# Roster and channels as the EMS collections hold them.
AGENTS = [
    {"agent_id": "2", "agent_name": "เจะรอฮานี วันหวัง", "agent_extension": "94004"},
    {"agent_id": "10", "agent_name": "อาสมะ ลาเตะ", "agent_extension": "94010"},
    {"agent_id": "1", "agent_name": "จิดาภา อินทอง", "agent_extension": "94001"},
]
CHANNELS = [
    {"channel_id": 1, "channel_name": "1669"},
    {"channel_id": 2, "channel_name": "2nd"},
    {"channel_id": 3, "channel_name": "วิทยุ"},
]


def setup() -> None:
    fl.install(DISTRICTS, SUBDISTRICTS, AGENTS, CHANNELS)


def _raises(func, *args, **kwargs):
    """Return the exception `func` raised, or fail if it raised nothing."""
    try:
        func(*args, **kwargs)
    except Exception as exc:  # noqa: BLE001 - the type is asserted by the caller
        return exc
    raise AssertionError("expected an error, got none")


# --- area resolution --------------------------------------------------------


def test_district_resolves_by_exact_name_and_by_code():
    setup()
    assert fl.resolve_district("เมืองปัตตานี")["district_code"] == "9401"
    assert fl.resolve_district("9401")["district_name"] == "เมืองปัตตานี"


def test_ambiguous_district_prefix_is_refused():
    # The acceptance criterion: "เมือง" must not silently become
    # "เมืองปัตตานี". A prefix that is unique in one province is not a name.
    setup()
    exc = _raises(fl.resolve_district, "เมือง")
    assert isinstance(exc, fl.AreaLookupError)
    assert "เมือง" in str(exc)


def test_unknown_district_is_refused():
    setup()
    assert isinstance(_raises(fl.resolve_district, "ยะลา"), fl.AreaLookupError)


def test_blank_district_is_refused():
    setup()
    assert isinstance(_raises(fl.resolve_district, ""), fl.AreaLookupError)


def test_area_resolution_stores_the_master_row_ids_only():
    # Ids on the document; codes and names come back through the cache.
    setup()
    area = fl.resolve_area("เมืองปัตตานี", "รูสะมิแล")
    assert area.to_fields() == {"district_id": 1, "subdistrict_id": 11}
    assert area.district_code == "9401" and area.subdistrict_code == "940110"
    assert fl.district(1)["district_name"] == "เมืองปัตตานี" and fl.subdistrict(11)["subdistrict_name"] == "รูสะมิแล"
    assert fl.district(99) is None and fl.subdistrict(None) is None
    # And the other direction, for filters that arrive as codes.
    assert fl.district_id_for_code("9402") == 2 and fl.subdistrict_id_for_code("940207") == 23
    assert fl.district_id_for_code("0000") is None


def test_subdistrict_from_another_district_is_refused():
    setup()
    exc = _raises(fl.resolve_area, "เมืองปัตตานี", "ปากล่อ")
    assert isinstance(exc, fl.AreaLookupError)
    assert "ปากล่อ" in str(exc)


def test_subdistrict_code_from_another_district_is_refused():
    # Passing the code rather than the name must not get past the same check.
    setup()
    assert isinstance(_raises(fl.resolve_area, "เมืองปัตตานี", "940207"), fl.AreaLookupError)


def test_area_names_tolerate_spreadsheet_whitespace():
    setup()
    fields = fl.resolve_area("  เมืองปัตตานี ", " รูสะมิแล  ").to_fields()
    assert fields["subdistrict_id"] == 11


def test_subdistricts_filter_by_district():
    setup()
    codes = [s["subdistrict_code"] for s in fl.subdistricts("9401")]
    assert codes == ["940106", "940110"]
    assert len(fl.subdistricts()) == 4


def test_subdistrict_with_unknown_parent_is_dropped_not_offered():
    # Offering it would put a row in the dropdown that fails at write time.
    fl.install(DISTRICTS, SUBDISTRICTS + [
        {"subdistrict_id": 99, "district_id": 77, "subdistrict_code": "947701", "subdistrict_name": "ไม่มีอำเภอ"},
    ], AGENTS, CHANNELS)
    assert "947701" not in {s["subdistrict_code"] for s in fl.subdistricts()}
    setup()


# --- phone ------------------------------------------------------------------


def test_both_phone_spellings_normalise_to_the_same_digits():
    assert fc.normalise_phone("083-1869048") == fc.normalise_phone("0831869048") == "0831869048"


def test_phone_formatting_groups_mobile_and_landline():
    assert fc.format_phone("0831869048") == "083-1869048"
    assert fc.format_phone("073349166") == "073-349166"


def test_unrecognised_phone_length_is_shown_untouched():
    assert fc.format_phone("12345") == "12345"
    assert fc.format_phone("") == ""


# --- fixed vocabularies -----------------------------------------------------


def test_channel_resolves_to_the_reporting_channels_id():
    # The id, the collection's own name, the old form code and the
    # spreadsheet's long spelling all land on the same row.
    setup()
    assert fc.resolve_channel(1) == 1 and fc.resolve_channel("1") == 1
    assert fc.resolve_channel("1669") == 1
    assert fc.resolve_channel("โทรศัพท์ หมายเลข 1669") == 1
    assert fc.resolve_channel("2nd") == 2 and fc.resolve_channel("Second Call") == 2 and fc.resolve_channel("second_call") == 2
    assert fc.resolve_channel("วิทยุ") == 3 and fc.resolve_channel("radio") == 3
    assert fc.resolve_channel(None) is None and fc.resolve_channel("") is None
    assert fl.channel_name(2) == "2nd" and fl.channel_name(None) == ""


def test_unknown_channel_is_refused():
    setup()
    assert isinstance(_raises(fc.resolve_channel, "LINE"), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_channel, "9"), fc.FloodCaseError)


def test_agent_resolves_to_the_roster_id_from_id_or_exact_name():
    setup()
    assert fc.resolve_agent("2") == "2" and fc.resolve_agent(2) == "2"
    assert fc.resolve_agent("เจะรอฮานี วันหวัง") == "2"
    assert fc.resolve_agent(None) is None and fc.resolve_agent("  ") is None
    assert isinstance(_raises(fc.resolve_agent, "ใครก็ไม่รู้"), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_agent, "99"), fc.FloodCaseError)
    # Roster order: numeric ids compared as numbers, so 1, 2, 10 - not 1, 10, 2.
    assert [a["agent_id"] for a in fl.agents()] == ["1", "2", "10"]


def test_blank_status_means_pending():
    # The spreadsheet's blank cell is a state, not missing data.
    assert fc.resolve_status(None) == fc.STATUS_PENDING
    assert fc.resolve_status("") == fc.STATUS_PENDING
    assert fc.resolve_status("สำเร็จ") == fc.STATUS_SUCCESS


def test_pending_exports_as_a_blank_cell():
    assert fc.STATUS_EXPORT_LABELS[fc.STATUS_PENDING] == ""
    assert fc.STATUS_EXPORT_LABELS[fc.STATUS_SUCCESS] == "สำเร็จ"


def test_gender_can_be_recorded_as_unspecified():
    assert fc.resolve_gender("ไม่ระบุ") == "unspecified" and fc.resolve_gender("unspecified") == "unspecified"
    assert fc.GENDER_LABELS["unspecified"] == "ไม่ระบุ"


def test_age_and_gender_may_be_blank():
    assert fc.resolve_age(None) is None and fc.resolve_age("") is None
    assert fc.resolve_gender(None) is None and fc.resolve_gender("") is None


def test_implausible_age_is_refused():
    assert isinstance(_raises(fc.resolve_age, 950), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_age, "ไม่ทราบ"), fc.FloodCaseError)


def test_months_need_the_years_and_stay_under_a_year():
    assert fc.resolve_age_months(None, 1) is None and fc.resolve_age_months("", None) is None
    assert fc.resolve_age_months(9, 1) == 9 and fc.resolve_age_months("11", 0) == 11
    assert isinstance(_raises(fc.resolve_age_months, 12, 1), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_age_months, 9, None), fc.FloodCaseError)


def test_days_need_the_months_and_stay_under_a_month():
    assert fc.resolve_age_days(None, 0) is None
    assert fc.resolve_age_days(5, 0) == 5 and fc.resolve_age_days("30", 3) == 30
    assert isinstance(_raises(fc.resolve_age_days, 31, 0), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_age_days, 5, None), fc.FloodCaseError)


def test_age_reads_as_before_unless_months_were_recorded():
    assert fc.format_age(None, None) == ""
    assert fc.format_age(45, None) == "45"
    assert fc.format_age(1, 9) == "1 ปี 9 เดือน"
    assert fc.format_age(1, 0) == "1 ปี"
    assert fc.format_age(0, 11) == "11 เดือน"
    assert fc.format_age(0, 3, 12) == "3 เดือน 12 วัน"
    assert fc.format_age(0, 0, 5) == "5 วัน"
    assert fc.format_age(0, 0) == "แรกเกิด"
    assert fc.format_age(0, 0, 0) == "แรกเกิด"


# --- shift ------------------------------------------------------------------


def test_shift_default_follows_libs_shift_at_every_boundary():
    # Asserted against `get_shift` itself rather than against hard-coded
    # names, so the two cannot drift apart if the boundary ever moves.
    for at in (
        datetime(2025, 11, 23, 8, 30),
        datetime(2025, 11, 23, 16, 29, 59),
        datetime(2025, 11, 23, 16, 30),
        datetime(2025, 11, 24, 0, 29, 59),
        datetime(2025, 11, 24, 0, 30),
        datetime(2025, 11, 24, 8, 29, 59),
    ):
        assert fc.resolve_shift(None, at) == get_shift(at)


def test_shift_can_be_overridden_across_a_boundary():
    # 16:28 written up by the incoming team is an ordinary occurrence.
    assert fc.resolve_shift("afternoon", datetime(2025, 11, 23, 16, 28)) == "afternoon"
    assert fc.resolve_shift("บ่าย", datetime(2025, 11, 23, 16, 28)) == "afternoon"


def test_unknown_shift_is_refused():
    assert isinstance(_raises(fc.resolve_shift, "evening", datetime(2025, 11, 23, 9, 0)), fc.FloodCaseError)


def test_operational_day_rolls_over_at_0830_not_midnight():
    setup()
    before = _build(reported_at=datetime(2025, 11, 24, 2, 15))
    after = _build(reported_at=datetime(2025, 11, 24, 9, 15))
    assert before["operational_day"] == datetime(2025, 11, 23)
    assert after["operational_day"] == datetime(2025, 11, 24)


# --- document assembly ------------------------------------------------------


def _build(**overrides):
    payload = {
        "district": "เมืองปัตตานี",
        "subdistrict": "รูสะมิแล",
        "chief_complaint": "ผป.ติดเตียง บริเวณรอบบ้านน้ำท่วม",
        "reported_at": datetime(2025, 11, 22, 11, 0),
    }
    payload.update(overrides)
    return fc.build_case_document(payload)


def test_document_never_carries_a_sequence_number():
    # "ลำดับ" is a render-time row count over the current filter. Storing one
    # would collide the instant two operators saved at the same moment.
    setup()
    doc = _build()
    for banned in ("seq", "sequence", "order", "no", "row_number", "index", "ลำดับ"):
        assert banned not in doc


def test_document_stores_one_instant_not_a_split_date_and_time():
    setup()
    doc = _build()
    assert doc["reported_at"] == datetime(2025, 11, 22, 11, 0)
    assert "reported_date" not in doc and "reported_time" not in doc


def test_case_id_is_stable_and_url_safe():
    setup()
    case_id = _build()["case_id"]
    assert case_id.startswith("FLD-20251122-")
    assert case_id.replace("-", "").isalnum()
    assert _build()["case_id"] != case_id


def test_missing_required_fields_are_refused():
    setup()
    assert isinstance(_raises(_build, chief_complaint="   "), fc.FloodCaseError)
    assert isinstance(_raises(_build, district=""), fc.FloodCaseError)
    assert isinstance(_raises(_build, subdistrict=""), fc.FloodCaseError)


def test_everything_else_may_be_blank():
    setup()
    doc = _build()
    for optional in ("agent_id", "channel_id", "reporter", "phone", "location_note",
                     "gender", "age", "ddpm_coordination", "operating_unit",
                     "assistance", "remarks"):
        assert doc[optional] is None, optional
    assert doc["status"] == fc.STATUS_PENDING


def test_location_note_is_free_text_not_a_coordinate():
    # Real values are landmarks; validating this as lat/lng would reject
    # almost every row the operators actually type.
    setup()
    for note in ("ร้านขนมจีนเมืองคอน", "ม.2 บ้านบือราแง", "13/6 ม.8"):
        assert _build(location_note=note)["location_note"] == note


def test_phone_is_stored_normalised_on_the_document():
    setup()
    assert _build(phone="083-1869048")["phone"] == "0831869048"


# --- the four sample rows ---------------------------------------------------

# Straight from the operators' spreadsheet, with one correction: it wrote the
# amphoe as "เมือง" where the master table has "เมืองปัตตานี". That prefix is
# refused on purpose (see `test_ambiguous_district_prefix_is_refused`), so the
# sample is corrected rather than the resolver loosened.
SAMPLE_ROWS = [
    {
        "reported_at": datetime(2025, 11, 22, 11, 0), "shift": "เช้า",
        "agent_name": "เจะรอฮานี วันหวัง", "channel": "โทรศัพท์ หมายเลข 1669",
        "reporter": "ญาติ", "phone": "083-1869048",
        "location_note": "ร้านขนมจีนเมืองคอน", "subdistrict": "รูสะมิแล", "district": "เมืองปัตตานี",
        "gender": "หญิง", "age": 95, "chief_complaint": "ผป.ติดเตียง บริเวณรอบบ้านน้ำท่วม",
        "ddpm_coordination": "-ประสานกู้ชีพเต็กก่า", "assistance": "ขนย้ายไปที่ปลอดภัยล่วงหน้า",
        "status": "สำเร็จ", "operating_unit": "กู้ชีพเต็กก่า", "remarks": "",
    },
    {
        "reported_at": datetime(2025, 11, 23, 12, 44), "shift": "เช้า",
        "agent_name": "อาสมะ ลาเตะ", "channel": "โทรศัพท์ หมายเลข 1669",
        "reporter": "จนท.", "phone": "080-8733867",
        "location_note": "ม.2 บ้านบือราแง", "subdistrict": "ปากู", "district": "ทุ่งยางแดง",
        "gender": "ชาย", "age": 70, "chief_complaint": "หายใจเหนื่อยหอบ U/Dหอบ",
        "ddpm_coordination": "ประสานงานทีมปภ.อำเภอทุ่งยางแดง", "assistance": "นำส่งผู้ป่วยโดยทีมทหาร",
        "status": "สำเร็จ", "operating_unit": "", "remarks": "",
    },
    {
        "reported_at": datetime(2025, 11, 23, 19, 39), "shift": "บ่าย",
        "agent_name": "จิดาภา อินทอง", "channel": "โทรศัพท์ หมายเลข 1669",
        "reporter": "ญาติ", "phone": "0843986400",
        "location_note": "13/6 ม.8", "subdistrict": "ปากล่อ", "district": "โคกโพธิ์",
        "gender": "หญิง", "age": 17,
        "chief_complaint": "เจ็บครรภ์คลอด G1 GA39+3 Wks. EC25/11/68 มีมูกเลือด",
        "ddpm_coordination": "ประสานงานทีมปภ.อำเภอโคกโพธิ์", "assistance": "นำส่งโดยกู้ชีพ",
        "status": "สำเร็จ", "operating_unit": "อบต.ปากล่อ", "remarks": "",
    },
    {
        # The row that matters most: both sex and age blank.
        "reported_at": datetime(2025, 11, 23, 15, 0), "shift": "บ่าย",
        "agent_name": "เจะรอฮานี วันหวัง", "channel": "Second Call",
        "reporter": "จนท.", "phone": "0858970669",
        "location_note": "ม.1", "subdistrict": "คลองมานิง", "district": "เมืองปัตตานี",
        "gender": "", "age": "", "chief_complaint": "ผป.ติดเตียง บริเวณรอบบ้านน้ำท่วม",
        "ddpm_coordination": "รับแจ้งจากทีมกู้ชีพในพื้นที่",
        "assistance": "นำส่งโดยกู้ชีพ/ส่งศูนย์พักพิงรร.คลองมานิง",
        "status": "สำเร็จ", "operating_unit": "อบต.คลองมานิง", "remarks": "",
    },
]


def test_every_sample_row_is_accepted():
    setup()
    docs = [fc.build_case_document(row) for row in SAMPLE_ROWS]
    assert len(docs) == 4
    assert [d["subdistrict_id"] for d in docs] == [11, 63, 23, 2]
    assert all(d["status"] == fc.STATUS_SUCCESS for d in docs)


def test_keys_survive_the_request_model():
    # The body reaches build_case_document through FloodCaseCreateIn, which
    # drops any field it does not declare and sends the rest as None. Both
    # bit once: agent_id / channel_id arrived and were stored as null.
    from libs.models import FloodCaseCreateIn
    setup()
    body = FloodCaseCreateIn(district="9402", subdistrict="940207", chief_complaint="น้ำท่วม",
                             agent_id="2", channel_id=1, age=1, age_months=9, age_days=5)
    doc = fc.build_case_document(body.model_dump())
    assert doc["agent_id"] == "2" and doc["channel_id"] == 1
    assert (doc["age"], doc["age_months"], doc["age_days"]) == (1, 9, 5)
    # And the older spellings still resolve when that is all a client sends.
    legacy = FloodCaseCreateIn(district="9402", subdistrict="940207", chief_complaint="น้ำท่วม",
                               agent_name="เจะรอฮานี วันหวัง", channel="Second Call")
    doc = fc.build_case_document(legacy.model_dump())
    assert doc["agent_id"] == "2" and doc["channel_id"] == 2


def test_the_document_holds_keys_and_reads_back_as_names():
    setup()
    doc = fc.build_case_document(SAMPLE_ROWS[0])
    assert doc["agent_id"] == "2" and doc["channel_id"] == 1
    assert doc["district_id"] == 1 and doc["subdistrict_id"] == 11
    for name_field in ("agent_name", "agent_extension", "channel",
                       "district_code", "district_name", "subdistrict_code", "subdistrict_name"):
        assert name_field not in doc, name_field
    case = fc.serialise_case(doc)
    assert case["agent_name"] == "เจะรอฮานี วันหวัง" and case["agent_extension"] == "94004"
    assert case["channel_id"] == 1 and case["channel_label"] == "1669"
    assert case["district_code"] == "9401" and case["district_name"] == "เมืองปัตตานี"
    assert case["subdistrict_code"] == "940110" and case["subdistrict_name"] == "รูสะมิแล"


def test_the_sample_row_with_no_sex_or_age_is_accepted():
    setup()
    doc = fc.build_case_document(SAMPLE_ROWS[3])
    assert doc["gender"] is None and doc["age"] is None
    assert doc["chief_complaint"]  # the part that was actually heard is kept


def test_sample_rows_keep_the_shift_the_operator_wrote():
    # Row 3 was logged at 15:00 as "บ่าย" though 15:00 is the morning shift -
    # the operator's own answer wins over the clock.
    setup()
    doc = fc.build_case_document(SAMPLE_ROWS[3])
    assert doc["shift"] == "afternoon"
    assert get_shift(SAMPLE_ROWS[3]["reported_at"]) == "morning"


# ---------------------------------------------------------------------------
# Query, duplicate-detection and export tests.
#
# Backed by an in-memory stand-in for the collection rather than a database,
# matching how the other suites stub their upstreams. It implements only the
# operators this module actually uses; anything else raises, so a query that
# quietly grows a new operator fails loudly here instead of passing untested.
# ---------------------------------------------------------------------------


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, spec):
        for key, direction in reversed(spec):
            self._docs.sort(key=lambda d: _sort_key(d.get(key)), reverse=direction < 0)
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def __iter__(self):
        return iter(self._docs)


def _sort_key(value):
    """None sorts below everything, so a missing field cannot crash the sort
    the way comparing None to a datetime would."""
    return (value is not None, value if value is not None else "")


def _matches(doc, query) -> bool:
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(doc, c) for c in condition):
                return False
        elif key == "$and":
            if not all(_matches(doc, c) for c in condition):
                return False
        elif not _field_matches(doc.get(key), condition):
            return False
    return True


def _field_matches(value, condition) -> bool:
    if not isinstance(condition, dict):
        return value == condition
    for op, operand in condition.items():
        if op == "$gte":
            if value is None or value < operand:
                return False
        elif op == "$lte":
            if value is None or value > operand:
                return False
        elif op == "$ne":
            if value == operand:
                return False
        elif op == "$in":
            if value not in operand:
                return False
        elif op == "$regex":
            flags = re.IGNORECASE if condition.get("$options") == "i" else 0
            if value is None or not re.search(operand, str(value), flags):
                return False
        elif op == "$options":
            continue
        else:
            raise AssertionError("query operator not implemented in the stub: " + op)
    return True


class FakeCollection:
    def __init__(self):
        self.docs: list[dict] = []

    # -- reads
    def find(self, query=None, projection=None):
        return _Cursor([dict(d) for d in self.docs if _matches(d, query or {})])

    def find_one(self, query=None, projection=None):
        for doc in self.docs:
            if _matches(doc, query or {}):
                return dict(doc)
        return None

    def count_documents(self, query=None):
        return sum(1 for d in self.docs if _matches(d, query or {}))

    # -- writes
    def insert_one(self, doc):
        self.docs.append(dict(doc))

    def update_one(self, query, update):
        for doc in self.docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                return type("R", (), {"matched_count": 1, "modified_count": 1, "upserted_id": None})()
        return type("R", (), {"matched_count": 0, "modified_count": 0, "upserted_id": None})()

    def update_many(self, query, update):
        n = 0
        for doc in self.docs:
            if _matches(doc, query):
                _apply_update(doc, update)
                n += 1
        return type("R", (), {"matched_count": n, "modified_count": n})()

    def create_index(self, *args, **kwargs):
        return None


def _apply_update(doc, update):
    """$set, and the one $push shape the history uses: $each with a negative
    $slice, which keeps the last N of the array."""
    doc.update(update.get("$set", {}))
    for field, spec in update.get("$push", {}).items():
        values = list(doc.get(field) or []) + list(spec["$each"])
        if "$slice" in spec:
            values = values[spec["$slice"]:]
        doc[field] = values


class _FakeDb(dict):
    def __getitem__(self, name):
        return self.setdefault(name, FakeCollection())

    def __getattr__(self, name):
        return self[name]


def _use_fake_collection() -> FakeCollection:
    """Point the module at an empty in-memory collection.

    `flood_cases` reads `db` at call time, not import time, so swapping the
    module attribute is enough and no database is ever contacted.
    """
    fake = _FakeDb()
    fc.db = fake
    return fake[fc.COLLECTION]


NOW = datetime(2025, 11, 23, 14, 0)


def _seed(collection, rows):
    for row in rows:
        collection.insert_one(fc.build_case_document(row, now=NOW))


def _case(**overrides):
    row = {
        "district": "โคกโพธิ์",
        "subdistrict": "ปากล่อ",
        "chief_complaint": "น้ำท่วมบ้าน",
        "reported_at": datetime(2025, 11, 23, 12, 0),
    }
    row.update(overrides)
    return row


# --- filtering --------------------------------------------------------------


def test_list_orders_newest_first_and_numbers_nothing():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 23, 10, 0)),
        _case(reported_at=datetime(2025, 11, 23, 12, 0)),
        _case(reported_at=datetime(2025, 11, 23, 9, 0)),
    ])
    result = fc.list_cases(fc.CaseFilters(), now=NOW)
    assert [c["time"] for c in result["cases"]] == ["12.00", "10.00", "09.00"]
    # The row number is the frontend's to count; nothing in the payload
    # carries one, which is what makes it restart at 1 under every filter.
    assert all("seq" not in c for c in result["cases"])


def test_oldest_first_is_sorted_before_the_limit_not_after():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 23, 10, 0)),
        _case(reported_at=datetime(2025, 11, 23, 12, 0)),
        _case(reported_at=datetime(2025, 11, 23, 9, 0)),
    ])
    result = fc.list_cases(fc.CaseFilters(order=fc.ORDER_ASC, limit=2), now=NOW)
    assert [c["time"] for c in result["cases"]] == ["09.00", "10.00"]
    # Anything but "asc" is the default, never an error.
    result = fc.list_cases(fc.CaseFilters(order="sideways"), now=NOW)
    assert [c["time"] for c in result["cases"]] == ["12.00", "10.00", "09.00"]


def test_every_filter_narrows_and_the_count_follows():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(),
        _case(district="เมืองปัตตานี", subdistrict="รูสะมิแล"),
        _case(district="เมืองปัตตานี", subdistrict="คลองมานิง", status="สำเร็จ"),
    ])
    assert fc.list_cases(fc.CaseFilters(), now=NOW)["total"] == 3
    assert fc.list_cases(fc.CaseFilters(district_code="9401"), now=NOW)["total"] == 2
    assert fc.list_cases(fc.CaseFilters(district_code="9402"), now=NOW)["total"] == 1
    assert fc.list_cases(fc.CaseFilters(subdistrict_code="940110"), now=NOW)["total"] == 1
    assert fc.list_cases(fc.CaseFilters(district_code="9401", subdistrict_code="940106"), now=NOW)["total"] == 1
    # A tambon from another amphoe, or an unknown code: nothing, never everything.
    assert fc.list_cases(fc.CaseFilters(district_code="9402", subdistrict_code="940110"), now=NOW)["total"] == 0
    assert fc.list_cases(fc.CaseFilters(subdistrict_code="000000"), now=NOW)["total"] == 0
    assert fc.list_cases(fc.CaseFilters(status="สำเร็จ"), now=NOW)["total"] == 1
    assert fc.list_cases(fc.CaseFilters(tab=fc.TAB_PENDING), now=NOW)["total"] == 2


def test_tab_counts_respect_the_other_filters():
    # A count next to a tab has to mean "within what is on screen"; a
    # collection-wide number beside a filtered table is unreconcilable.
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(status="สำเร็จ"),
        _case(),
        _case(district="เมืองปัตตานี", subdistrict="รูสะมิแล", status="สำเร็จ"),
    ])
    counts = fc.list_cases(fc.CaseFilters(district_code="9402"), now=NOW)["counts"]
    assert counts["all"] == 2 and counts["success"] == 1 and counts["pending"] == 1


def test_a_set_of_dates_matches_exactly_those_days_and_beats_the_span():
    # The third shape of the date filter. Picked days are matched one by one,
    # not as the span between the first and the last - "1st, 4th, 28th" must
    # not quietly become "1st to 28th".
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 1, 10, 0)),
        _case(reported_at=datetime(2025, 11, 2, 10, 0)),
        _case(reported_at=datetime(2025, 11, 4, 10, 0)),
        _case(reported_at=datetime(2025, 11, 28, 10, 0)),
    ])
    from datetime import date as d
    picked = fc.CaseFilters(dates=[d(2025, 11, 28), d(2025, 11, 1), d(2025, 11, 4), d(2025, 11, 4)])
    assert fc.list_cases(picked, now=NOW)["total"] == 3
    # One control, one mode at a time: when both arrive the set wins.
    both = fc.CaseFilters(dates=[d(2025, 11, 2)], date_from=d(2025, 11, 1), date_to=d(2025, 11, 30))
    assert fc.list_cases(both, now=NOW)["total"] == 1


def test_context_is_active_only_while_cases_are_recent():
    # The time tabs follow the data, not the calendar: a week of silence
    # after the last case and the page is an archive, whatever the month.
    setup()
    col = _use_fake_collection()
    assert fc.list_cases(fc.CaseFilters(), now=NOW)["context"]["active"] is False

    _seed(col, [_case(reported_at=datetime(2025, 11, 23, 12, 0))])
    assert fc.list_cases(fc.CaseFilters(), now=NOW)["context"]["active"] is True
    # Exactly a week later, still inside the window.
    edge = NOW + timedelta(days=fc.ACTIVE_WINDOW_DAYS)
    assert fc.list_cases(fc.CaseFilters(), now=edge)["context"]["active"] is True
    # A day past it, and January's reviewer sees no "วันนี้ 0".
    assert fc.list_cases(fc.CaseFilters(), now=edge + timedelta(days=1))["context"]["active"] is False
    # The flag ignores whatever the table is filtered to, so a date range
    # set in the middle of the event does not switch the tabs off.
    from datetime import date as d
    old_range = fc.CaseFilters(date_from=d(2025, 11, 1), date_to=d(2025, 11, 10))
    assert fc.list_cases(old_range, now=NOW)["context"]["active"] is True


def test_date_range_uses_the_operational_day_not_the_calendar_day():
    # 02:00 on the 24th belongs to the 23rd's sheet. Filtering on the calendar
    # date would file it under a day the paper record does not agree with.
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 24, 2, 0)),
        _case(reported_at=datetime(2025, 11, 24, 9, 0)),
    ])
    from datetime import date as d
    only_23 = fc.CaseFilters(date_from=d(2025, 11, 23), date_to=d(2025, 11, 23))
    only_24 = fc.CaseFilters(date_from=d(2025, 11, 24), date_to=d(2025, 11, 24))
    assert fc.list_cases(only_23, now=NOW)["total"] == 1
    assert fc.list_cases(only_24, now=NOW)["total"] == 1


def test_today_and_current_shift_tabs_follow_the_clock():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 23, 10, 0)),   # morning of the 23rd
        _case(reported_at=datetime(2025, 11, 23, 18, 0)),   # afternoon of the 23rd
        _case(reported_at=datetime(2025, 11, 20, 10, 0)),   # an older day
    ])
    at_afternoon = datetime(2025, 11, 23, 18, 30)
    assert fc.list_cases(fc.CaseFilters(tab=fc.TAB_TODAY), now=at_afternoon)["total"] == 2
    assert fc.list_cases(fc.CaseFilters(tab=fc.TAB_CURRENT_SHIFT), now=at_afternoon)["total"] == 1


def test_search_finds_a_phone_typed_either_way():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(phone="083-1869048"), _case(phone="0801111111")])
    for typed in ("0831869048", "083-1869048", "1869048"):
        assert fc.list_cases(fc.CaseFilters(search=typed), now=NOW)["total"] == 1, typed


def test_search_covers_the_fields_an_operator_would_recall():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reporter="ญาติ", operating_unit="กู้ชีพเต็กก่า", chief_complaint="ผป.ติดเตียง"),
        _case(reporter="จนท.", operating_unit="อบต.ปากล่อ", chief_complaint="เจ็บครรภ์คลอด"),
    ])
    for term, expected in (("เต็กก่า", 1), ("ติดเตียง", 1), ("ญาติ", 1), ("ปากล่อ", 2)):
        assert fc.list_cases(fc.CaseFilters(search=term), now=NOW)["total"] == expected, term


def test_search_text_is_escaped_not_treated_as_a_regex():
    # An operator typing a bracket must search for it, not write a pattern.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(location_note="บ้าน (หลังวัด)")])
    assert fc.list_cases(fc.CaseFilters(search="(หลังวัด)"), now=NOW)["total"] == 1
    assert fc.list_cases(fc.CaseFilters(search="ก.*ด"), now=NOW)["total"] == 0


def test_result_window_is_capped_and_says_so():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(reported_at=datetime(2025, 11, 23, 12, i % 60)) for i in range(12)])
    result = fc.list_cases(fc.CaseFilters(limit=5), now=NOW)
    assert len(result["cases"]) == 5 and result["total"] == 12
    # The operator is scanning for a duplicate; a silently truncated list is
    # worse than no list.
    assert result["truncated"] is True
    assert fc.list_cases(fc.CaseFilters(limit=50), now=NOW)["truncated"] is False


def test_limit_is_clamped_and_a_missing_one_falls_back():
    setup()
    _use_fake_collection()
    # An absurd limit is capped rather than honoured: this window is held in
    # memory and pushed down every open SSE connection.
    assert fc.CaseFilters(limit=999999).normalised().limit == fc.MAX_LIMIT
    # 0 and None both mean "unspecified" - neither is a usable page size, and
    # answering a request for zero rows with zero rows would look like an
    # empty table rather than a bad parameter.
    assert fc.CaseFilters(limit=0).normalised().limit == fc.DEFAULT_LIMIT
    assert fc.CaseFilters(limit=None).normalised().limit == fc.DEFAULT_LIMIT
    assert fc.CaseFilters(offset=-5).normalised().offset == 0


# --- duplicate detection ----------------------------------------------------


def test_duplicate_found_by_phone_within_the_window():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(phone="081-2345678", reported_at=NOW - timedelta(hours=2))])
    matches = fc.find_duplicates(phone="0812345678", now=NOW)
    assert len(matches) == 1 and matches[0]["match_reason"] == "phone"
    # The warning names a time and a tambon, never a row number.
    assert matches[0]["time"] and matches[0]["subdistrict_name"] == "ปากล่อ"


def test_duplicate_outside_the_window_is_not_reported():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(phone="081-2345678", reported_at=NOW - timedelta(hours=7))])
    assert fc.find_duplicates(phone="0812345678", now=NOW) == []


def test_duplicate_found_by_tambon_and_a_partial_landmark():
    # One operator writes the full address, the next writes half of it.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(location_note="ม.2 บ้านบือราแง", reported_at=NOW - timedelta(hours=1))])
    matches = fc.find_duplicates(subdistrict_code="940207", location_note="บ้านบือราแง", now=NOW)
    assert len(matches) == 1 and matches[0]["match_reason"] == "location"


def test_same_tambon_but_a_different_place_does_not_warn():
    # During a flood the whole tambon is calling; the tambon alone is noise.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(location_note="ม.9 บ้านโคกเนียง", reported_at=NOW - timedelta(hours=1))])
    assert fc.find_duplicates(subdistrict_code="940207", location_note="ม.2 บ้านบือราแง", now=NOW) == []


def test_a_very_short_landmark_does_not_match_everything():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(location_note="ม.10 บ้านปลายคลอง", reported_at=NOW - timedelta(hours=1))])
    assert fc.find_duplicates(subdistrict_code="940207", location_note="ม.1", now=NOW) == []


def test_a_case_does_not_warn_about_itself_while_being_edited():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(phone="081-2345678", reported_at=NOW - timedelta(hours=1))])
    own_id = col.docs[0]["case_id"]
    assert fc.find_duplicates(phone="0812345678", now=NOW) != []
    assert fc.find_duplicates(phone="0812345678", exclude_case_id=own_id, now=NOW) == []


def test_duplicate_check_with_nothing_to_go_on_returns_nothing():
    # Called on a debounce from an empty form; it must not scan the collection.
    setup()
    _use_fake_collection()
    assert fc.find_duplicates(now=NOW) == []


# --- writing ----------------------------------------------------------------


def test_status_update_leaves_every_other_field_alone():
    # The table's row button sends only a status. If that path could carry the
    # other eighteen fields, a stale row would overwrite what somebody else is
    # typing into the drawer.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(chief_complaint="ผป.ติดเตียง", operating_unit="กู้ชีพเต็กก่า")])
    case_id = col.docs[0]["case_id"]
    updated = fc.set_status(case_id, "สำเร็จ", now=NOW)
    assert updated["status"] == fc.STATUS_SUCCESS
    assert updated["chief_complaint"] == "ผป.ติดเตียง"
    assert updated["operating_unit"] == "กู้ชีพเต็กก่า"


def test_status_update_on_a_missing_case_reports_it():
    setup()
    _use_fake_collection()
    assert fc.set_status("FLD-19990101-DEADBEEF", "success", now=NOW) is None


def test_bulk_status_updates_only_the_named_cases():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(), _case(), _case()])
    ids = [d["case_id"] for d in col.docs[:2]]
    assert fc.bulk_set_status(ids, "สำเร็จ", now=NOW) == 2
    statuses = sorted(d["status"] for d in col.docs)
    assert statuses == [fc.STATUS_PENDING, fc.STATUS_SUCCESS, fc.STATUS_SUCCESS]


# --- edit history -------------------------------------------------------------


def _history(col, case_id):
    return fc.serialise_history(col.find_one({"case_id": case_id}))


def test_an_edit_records_what_changed_in_words():
    # The entry reads as the form does - names and labels, not the ids the
    # document stores - so "who changed the crew?" is answered in one look.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(operating_unit="กู้ชีพเต็กก่า")])
    case_id = col.docs[0]["case_id"]
    later = NOW + timedelta(minutes=5)
    fc.apply_update(case_id, {"operating_unit": "อบต.ปากล่อ", "district": "เมืองปัตตานี", "subdistrict": "รูสะมิแล"}, now=later)
    [entry] = _history(col, case_id)
    assert entry["at"] == later.isoformat()
    changed = {c["field"]: (c["from"], c["to"]) for c in entry["changes"]}
    assert changed["operating_unit"] == ("กู้ชีพเต็กก่า", "อบต.ปากล่อ")
    assert changed["district_name"] == ("โคกโพธิ์", "เมืองปัตตานี")
    assert changed["subdistrict_name"] == ("ปากล่อ", "รูสะมิแล")
    assert all(c["label"] for c in entry["changes"])
    # Only what changed: the complaint was sent back unchanged and is absent.
    assert "chief_complaint" not in changed


def test_a_save_that_changes_nothing_visible_leaves_no_entry():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(assistance="ขนย้ายแล้ว")])
    case_id = col.docs[0]["case_id"]
    fc.apply_update(case_id, {"assistance": "ขนย้ายแล้ว"}, now=NOW)
    assert _history(col, case_id) == []


def test_the_row_button_is_an_edit_too():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    case_id = col.docs[0]["case_id"]
    fc.set_status(case_id, "สำเร็จ", now=NOW)
    # Marking it finished again is not a second edit.
    fc.set_status(case_id, "สำเร็จ", now=NOW + timedelta(minutes=1))
    [entry] = _history(col, case_id)
    assert entry["changes"] == [{"field": "status_label", "label": "สำเร็จ", "from": "ยังไม่สำเร็จ", "to": "สำเร็จ"}]


def test_bulk_status_records_an_entry_only_where_it_flipped():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(), _case(status="สำเร็จ")])
    ids = [d["case_id"] for d in col.docs]
    assert fc.bulk_set_status(ids, "สำเร็จ", now=NOW) == 1
    assert len(_history(col, ids[0])) == 1
    assert _history(col, ids[1]) == []


def test_history_keeps_the_newest_ten_newest_first():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    case_id = col.docs[0]["case_id"]
    for i in range(12):
        fc.apply_update(case_id, {"remarks": f"ครั้งที่ {i}"}, now=NOW + timedelta(minutes=i))
    history = _history(col, case_id)
    assert len(history) == fc.HISTORY_LIMIT == 10
    assert history[0]["changes"][0]["to"] == "ครั้งที่ 11"
    assert history[-1]["changes"][0]["to"] == "ครั้งที่ 2"
    # The endpoint's view of it, and its answer for a case that is not there.
    assert fc.get_history(case_id) == history
    assert fc.get_history("FLD-19990101-DEADBEEF") is None


def test_bulk_status_with_no_ids_writes_nothing():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    assert fc.bulk_set_status([], "success", now=NOW) == 0
    assert col.docs[0]["status"] == fc.STATUS_PENDING


def test_an_edit_keeps_the_original_report_time_and_identity():
    # An edit made the next morning must not restamp the case with the time
    # somebody corrected it.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(reported_at=datetime(2025, 11, 23, 12, 0))])
    original = dict(col.docs[0])
    later = datetime(2025, 11, 24, 9, 0)

    updated = fc.apply_update(original["case_id"], _case(chief_complaint="แก้ไขแล้ว"), now=later)["case"]
    assert updated["case_id"] == original["case_id"]
    assert updated["chief_complaint"] == "แก้ไขแล้ว"
    assert col.docs[0]["reported_at"] == datetime(2025, 11, 23, 12, 0)
    assert col.docs[0]["created_at"] == original["created_at"]
    assert col.docs[0]["updated_at"] == later


def test_correcting_the_time_refiles_the_case_under_the_right_day():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(reported_at=datetime(2025, 11, 24, 9, 0))])
    case_id = col.docs[0]["case_id"]
    assert col.docs[0]["operational_day"] == datetime(2025, 11, 24)

    fc.apply_update(case_id, _case(reported_at=datetime(2025, 11, 24, 2, 0)), now=NOW)
    assert col.docs[0]["operational_day"] == datetime(2025, 11, 23)


def test_editing_a_missing_case_reports_it():
    setup()
    _use_fake_collection()
    assert fc.apply_update("FLD-19990101-DEADBEEF", _case(), now=NOW) is None


# --- partial edits: several hands finishing one case --------------------------


def test_an_edit_writes_only_the_fields_it_sent():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(assistance="ขนย้าย", ddpm_coordination="ประสาน ปภ.", remarks="เดิม")])
    case_id = col.docs[0]["case_id"]

    result = fc.apply_update(case_id, {"assistance": "ขนย้ายแล้ว"}, now=NOW)
    assert result["changed"] == ["assistance"]
    assert col.docs[0]["assistance"] == "ขนย้ายแล้ว"
    # Untouched fields are untouched - not rewritten from anything.
    assert col.docs[0]["ddpm_coordination"] == "ประสาน ปภ." and col.docs[0]["remarks"] == "เดิม"
    assert col.docs[0]["chief_complaint"] == "น้ำท่วมบ้าน"


def test_two_operators_editing_different_fields_both_land():
    # The scenario this exists for: one finishes การช่วยเหลือ, the other is
    # still on the ปภ. line. Whichever saves second must not erase the first.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    case_id = col.docs[0]["case_id"]

    fc.apply_update(case_id, {"assistance": "ขนย้ายไปที่ปลอดภัย"}, now=NOW)
    fc.apply_update(case_id, {"ddpm_coordination": "ประสานงานทีมปภ.อำเภอโคกโพธิ์"}, now=NOW)
    assert col.docs[0]["assistance"] == "ขนย้ายไปที่ปลอดภัย"
    assert col.docs[0]["ddpm_coordination"] == "ประสานงานทีมปภ.อำเภอโคกโพธิ์"


def test_a_sent_null_clears_and_an_absent_field_does_not():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(remarks="เดิม", assistance="เดิม")])
    case_id = col.docs[0]["case_id"]
    fc.apply_update(case_id, {"remarks": None}, now=NOW)
    assert col.docs[0]["remarks"] is None and col.docs[0]["assistance"] == "เดิม"


def test_a_partial_edit_is_validated_against_what_is_stored():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(age=1)])
    case_id = col.docs[0]["case_id"]
    # Months alone are fine because the stored years stand in ...
    fc.apply_update(case_id, {"age_months": 9}, now=NOW)
    assert (col.docs[0]["age"], col.docs[0]["age_months"]) == (1, 9)
    # ... and a tambon alone is checked inside the stored amphoe.
    assert isinstance(_raises(fc.apply_update, case_id, {"subdistrict": "รูสะมิแล"}, now=NOW), fc.FloodCaseError)
    fc.apply_update(case_id, {"district": "เมืองปัตตานี", "subdistrict": "รูสะมิแล"}, now=NOW)
    assert (col.docs[0]["district_id"], col.docs[0]["subdistrict_id"]) == (1, 11)


def test_a_group_member_sent_alone_writes_the_whole_group():
    # A corrected time re-files the case: operational_day moves with
    # reported_at even though only reported_at was sent. The stored shift is
    # kept - it is the operator's own answer, and on an edit it is only
    # replaced when a new one is sent (same rule as the full rewrite had).
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(reported_at=datetime(2025, 11, 24, 9, 0))])
    case_id = col.docs[0]["case_id"]
    result = fc.apply_update(case_id, {"reported_at": datetime(2025, 11, 24, 2, 0)}, now=NOW)
    assert result["changed"] == ["reported_at"]
    assert col.docs[0]["operational_day"] == datetime(2025, 11, 23)
    assert col.docs[0]["shift"] == "morning"
    fc.apply_update(case_id, {"shift": "afternoon"}, now=NOW)
    assert col.docs[0]["shift"] == "afternoon"


def test_an_empty_edit_changes_nothing():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    before = dict(col.docs[0])
    result = fc.apply_update(before["case_id"], {}, now=NOW)
    assert result["changed"] == [] and col.docs[0] == before


def test_the_update_model_tells_absent_from_null():
    from libs.models import FloodCaseUpdateIn
    body = FloodCaseUpdateIn(remarks=None)
    assert body.model_dump(exclude_unset=True) == {"remarks": None}
    assert FloodCaseUpdateIn().model_dump(exclude_unset=True) == {}


# --- two hands on one field ---------------------------------------------------


def test_a_field_changed_since_the_form_loaded_is_refused_not_overwritten():
    # Both open the case at "1". A saves "123"; B, still holding "1" as the
    # starting point, saves "12". B's save must not erase A's.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(chief_complaint="1")])
    case_id = col.docs[0]["case_id"]

    fc.apply_update(case_id, {"chief_complaint": "123"}, base={"chief_complaint": "1"}, now=NOW)
    conflict = _raises(fc.apply_update, case_id, {"chief_complaint": "12"}, base={"chief_complaint": "1"}, now=NOW)
    assert isinstance(conflict, fc.FloodCaseConflict)
    assert conflict.fields == ["อาการสำคัญ / รายละเอียด"]
    assert conflict.case["chief_complaint"] == "123"
    assert col.docs[0]["chief_complaint"] == "123"

    # B has now seen "123" and chosen to keep "12": that save goes through.
    fc.apply_update(case_id, {"chief_complaint": "12"}, base={"chief_complaint": "123"}, now=NOW)
    assert col.docs[0]["chief_complaint"] == "12"


def test_a_stale_base_on_a_field_nobody_else_touched_is_no_conflict():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(remarks="เดิม")])
    case_id = col.docs[0]["case_id"]

    fc.apply_update(case_id, {"assistance": "ขนย้ายแล้ว"}, base={"assistance": None}, now=NOW)
    fc.apply_update(case_id, {"remarks": "ใหม่"}, base={"remarks": "เดิม"}, now=NOW)
    assert (col.docs[0]["assistance"], col.docs[0]["remarks"]) == ("ขนย้ายแล้ว", "ใหม่")


def test_both_hands_typing_the_same_value_is_no_conflict():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(chief_complaint="1")])
    case_id = col.docs[0]["case_id"]
    fc.apply_update(case_id, {"chief_complaint": "123"}, base={"chief_complaint": "1"}, now=NOW)
    fc.apply_update(case_id, {"chief_complaint": " 123 "}, base={"chief_complaint": "1"}, now=NOW)
    assert col.docs[0]["chief_complaint"] == "123"


def test_the_base_is_compared_as_the_form_shows_it():
    # Stored with seconds and phone digits; the form knows whole minutes and
    # the formatted number. Neither is a change by someone else.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(reported_at=datetime(2025, 11, 23, 12, 0, 37), phone="0812345678")])
    case_id = col.docs[0]["case_id"]
    fc.apply_update(
        case_id,
        {"reported_at": datetime(2025, 11, 23, 12, 5), "phone": "0899999999"},
        base={"reported_at": datetime(2025, 11, 23, 12, 0), "phone": "081-234-5678"},
        now=NOW,
    )
    assert col.docs[0]["reported_at"] == datetime(2025, 11, 23, 12, 5)
    assert col.docs[0]["phone"] == "0899999999"


def test_a_save_landing_between_the_check_and_the_write_is_caught():
    # A's write lands after B's save has read the case but before B writes.
    # B's write must not go through on the copy it checked.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(chief_complaint="1")])
    case_id = col.docs[0]["case_id"]

    real_update = col.update_one

    def a_gets_there_first(query, update):
        col.update_one = real_update
        real_update({"case_id": case_id}, {"$set": {"chief_complaint": "123", "updated_at": NOW + timedelta(seconds=1)}})
        return real_update(query, update)

    col.update_one = a_gets_there_first
    conflict = _raises(fc.apply_update, case_id, {"chief_complaint": "12"}, base={"chief_complaint": "1"}, now=NOW)
    assert isinstance(conflict, fc.FloodCaseConflict)
    assert col.docs[0]["chief_complaint"] == "123"


def test_the_update_model_carries_the_base_apart_from_the_fields():
    from libs.models import FloodCaseUpdateIn
    body = FloodCaseUpdateIn(chief_complaint="12", base={"chief_complaint": "1"})
    payload = body.model_dump(exclude_unset=True)
    assert payload.pop("base") == {"chief_complaint": "1"}
    assert payload == {"chief_complaint": "12"}


# --- export -----------------------------------------------------------------


def test_export_numbers_rows_at_render_time_and_keeps_the_sheet_order():
    setup()
    col = _use_fake_collection()
    _seed(col, [
        _case(reported_at=datetime(2025, 11, 23, 12, 0)),
        _case(reported_at=datetime(2025, 11, 23, 9, 0)),
        _case(reported_at=datetime(2025, 11, 23, 15, 0)),
    ])
    rows = list(csv.reader(io.StringIO(fc.export_csv(fc.CaseFilters(), now=NOW))))
    assert rows[0][0] == "ลำดับ" and len(rows[0]) == 19
    # Oldest first and numbered 1..n, the way the sheet reads.
    assert [r[0] for r in rows[1:]] == ["1", "2", "3"]
    assert [r[4] for r in rows[1:]] == ["09.00", "12.00", "15.00"]


def test_export_follows_the_current_filter():
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(), _case(district="เมืองปัตตานี", subdistrict="รูสะมิแล")])
    rows = list(csv.reader(io.StringIO(fc.export_csv(fc.CaseFilters(district_code="9401"), now=NOW))))
    assert len(rows) == 2 and rows[1][10] == "เมืองปัตตานี"


def test_export_writes_a_pending_case_as_a_blank_cell():
    # So an exported file still reads like the sheet it replaces.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case(), _case(status="สำเร็จ")])
    rows = list(csv.reader(io.StringIO(fc.export_csv(fc.CaseFilters(), now=NOW))))
    status_column = [r[16] for r in rows[1:]]
    assert sorted(status_column) == ["", "สำเร็จ"]


def test_export_never_writes_the_word_none():
    # Every optional field is allowed to be empty, and `None` reaching a cell
    # would be read as a value by whoever opens the file.
    setup()
    col = _use_fake_collection()
    _seed(col, [_case()])
    body = fc.export_csv(fc.CaseFilters(), now=NOW)
    assert "None" not in body
