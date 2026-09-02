"""Offline tests for the flood intake data layer.

No database and no network: `flood_lookups.install` takes the area tables as
plain dicts precisely so the resolution rules - the part that decides what
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


def setup() -> None:
    fl.install(DISTRICTS, SUBDISTRICTS)


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


def test_area_resolution_carries_all_four_snapshot_fields():
    # Codes *and* names, never an id to be joined later: a case is a record of
    # what was true when it was written.
    setup()
    fields = fl.resolve_area("เมืองปัตตานี", "รูสะมิแล").to_fields()
    assert fields == {
        "district_code": "9401",
        "district_name": "เมืองปัตตานี",
        "subdistrict_code": "940110",
        "subdistrict_name": "รูสะมิแล",
    }


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
    assert fields["subdistrict_code"] == "940110"


def test_subdistricts_filter_by_district():
    setup()
    codes = [s["subdistrict_code"] for s in fl.subdistricts("9401")]
    assert codes == ["940106", "940110"]
    assert len(fl.subdistricts()) == 4


def test_subdistrict_with_unknown_parent_is_dropped_not_offered():
    # Offering it would put a row in the dropdown that fails at write time.
    fl.install(DISTRICTS, SUBDISTRICTS + [
        {"subdistrict_id": 99, "district_id": 77, "subdistrict_code": "947701", "subdistrict_name": "ไม่มีอำเภอ"},
    ])
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


def test_channel_accepts_both_the_form_label_and_the_spreadsheet_wording():
    assert fc.resolve_channel("1669") == "1669"
    assert fc.resolve_channel("โทรศัพท์ หมายเลข 1669") == "1669"
    assert fc.resolve_channel("Second Call") == "second_call"
    assert fc.resolve_channel("วิทยุ") == "radio"


def test_unknown_channel_is_refused():
    assert isinstance(_raises(fc.resolve_channel, "LINE"), fc.FloodCaseError)


def test_blank_status_means_pending():
    # The spreadsheet's blank cell is a state, not missing data.
    assert fc.resolve_status(None) == fc.STATUS_PENDING
    assert fc.resolve_status("") == fc.STATUS_PENDING
    assert fc.resolve_status("สำเร็จ") == fc.STATUS_SUCCESS


def test_pending_exports_as_a_blank_cell():
    assert fc.STATUS_EXPORT_LABELS[fc.STATUS_PENDING] == ""
    assert fc.STATUS_EXPORT_LABELS[fc.STATUS_SUCCESS] == "สำเร็จ"


def test_age_and_gender_may_be_blank():
    assert fc.resolve_age(None) is None and fc.resolve_age("") is None
    assert fc.resolve_gender(None) is None and fc.resolve_gender("") is None


def test_implausible_age_is_refused():
    assert isinstance(_raises(fc.resolve_age, 950), fc.FloodCaseError)
    assert isinstance(_raises(fc.resolve_age, "ไม่ทราบ"), fc.FloodCaseError)


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
    for optional in ("agent_name", "channel", "reporter", "phone", "location_note",
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
    assert [d["subdistrict_code"] for d in docs] == ["940110", "940604", "940207", "940106"]
    assert all(d["status"] == fc.STATUS_SUCCESS for d in docs)


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
                doc.update(update["$set"])
                return type("R", (), {"matched_count": 1, "modified_count": 1, "upserted_id": None})()
        return type("R", (), {"matched_count": 0, "modified_count": 0, "upserted_id": None})()

    def update_many(self, query, update):
        n = 0
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update["$set"])
                n += 1
        return type("R", (), {"matched_count": n, "modified_count": n})()

    def create_index(self, *args, **kwargs):
        return None


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

    updated = fc.apply_update(original["case_id"], _case(chief_complaint="แก้ไขแล้ว"), now=later)
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
