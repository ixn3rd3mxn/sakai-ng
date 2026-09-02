from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

CallCode = Literal["NY", "RM", "LDN", "IST", "PRS"]


class IncidentCreateIn(BaseModel):
    """Body for POST /api/incidents.

    Only `call_type_code` is always required. The remaining fields are only
    required (and only stored) when call_type_code == "NY", mirroring the
    dispatch-action-dial form: every other call type disables those fields.
    Text fields carry the full label the frontend already displays (e.g.
    "CBD1 ปวดท้อง หลัง เชิงกราน"), and are resolved to ids server-side.
    """

    call_type_code: CallCode
    reporting_channel_name: Optional[str] = None
    case_type_name: Optional[str] = None
    cbd_name: Optional[str] = None
    severity_name: Optional[str] = None


# --- flood-response intake --------------------------------------------------
#
# Appended rather than folded into the model above: `flood_cases` and
# `incidents` describe different events and share no field, so a common base
# would only couple the EMS dispatch form to a form it has nothing to do with.

FloodShift = Literal["morning", "afternoon", "night"]


class FloodCaseCreateIn(BaseModel):
    """Body for POST /api/flood-cases.

    Only `district`, `subdistrict` and `chief_complaint` are required. The
    rest are optional because a flood call frequently drops before the
    operator has asked them - the spreadsheet this replaces has real rows with
    both age and sex blank - and a form that refuses to save a partial record
    just moves that record onto paper.

    Names and codes are both accepted for the area fields and resolved
    server-side (see `libs.flood_lookups.resolve_area`), which is also where
    an ambiguous amphoe is rejected rather than guessed at.
    """

    district: str
    subdistrict: str
    chief_complaint: str

    # The form shows separate date and time inputs because that is the order
    # the information arrives on a call; they are merged client-side into one
    # instant, since every query on this collection is a time range and a
    # split pair cannot be range-scanned. Omitted entirely means "now",
    # resolved server-side through `now_local()`.
    reported_at: Optional[datetime] = None
    # Defaulted from `reported_at` when omitted, but overridable: a call that
    # lands at 16:28 is regularly written up by the incoming team.
    shift: Optional[FloodShift] = None

    agent_name: Optional[str] = None
    agent_extension: Optional[str] = None
    channel: Optional[str] = None

    # A relationship ("ญาติ", "จนท."), not a person - free text with
    # shortcuts, because the tail of this column is long and unpredictable.
    reporter: Optional[str] = None
    phone: Optional[str] = None

    # Named "พิกัด" on the form but holding landmarks in practice
    # ("ม.2 บ้านบือราแง"), so it is never parsed as a coordinate.
    location_note: Optional[str] = None

    gender: Optional[str] = None
    age: Optional[int] = None

    ddpm_coordination: Optional[str] = None
    operating_unit: Optional[str] = None
    assistance: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


class FloodCaseUpdateIn(FloodCaseCreateIn):
    """Body for PATCH /api/flood-cases/{case_id}.

    Same shape as create, so the drawer can submit the form it already holds
    without a second mapping. `reported_at` omitted here means "leave it
    alone" rather than "now" - an edit made the next morning must not stamp
    the case with the time it was corrected.
    """


class FloodCaseStatusIn(BaseModel):
    """Body for the status-only updates.

    Deliberately not `FloodCaseUpdateIn`: marking a case finished is the most
    frequent action on the page and is done straight from the table row. It
    must not require the client to hold, resend and therefore be able to
    clobber the other eighteen fields - particularly while somebody else has
    that same case open in a drawer.
    """

    status: str


class FloodCaseBulkStatusIn(FloodCaseStatusIn):
    """Body for POST /api/flood-cases/bulk-status."""

    case_ids: list[str]
