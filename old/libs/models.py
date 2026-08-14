from pydantic import BaseModel
from typing import Optional


class Rescue(BaseModel):
    rescue_id: int
    rescue_name: str


class ShiftWork(BaseModel):
    shiftwork_id: int
    shiftwork_name: str


class Incident(BaseModel):
    date: str  # YYYY-MM-DD
    shift_id: int
    type: str  # แจ้งเหตุ, ปรึกษา, สายหลุด, ก่อกวน
    subtype: Optional[str] = None  # 1669, 2nd, วิทยุ
    level: Optional[str] = None  # trauma, non-trauma
    cbd_criteria: Optional[str] = None
    cbd_level: Optional[str] = None


