from __future__ import annotations

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
