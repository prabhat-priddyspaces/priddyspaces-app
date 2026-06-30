from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


CalendarEventKind = Literal["booking", "request", "subscription"]


class CalendarMember(BaseModel):
    public_id: str
    name: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class CalendarEvent(BaseModel):
    kind: CalendarEventKind
    public_id: str
    space_public_id: str
    space_name: Optional[str] = None
    space_type: str
    location_public_id: str
    location_name: str
    start: datetime
    end: datetime
    status: str
    payment_status: Optional[str] = None
    member: CalendarMember
    amount_cents: Optional[int] = None
    checked_in: Optional[bool] = None
    no_show: Optional[bool] = None
    request_kind: Optional[str] = None
    plan_name: Optional[str] = None
    seats_requested: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class CalendarSpace(BaseModel):
    public_id: str
    name: Optional[str] = None
    space_type: str
    location_public_id: str
    location_name: str
    location_timezone: Optional[str] = None
    capacity: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class CalendarResponse(BaseModel):
    start: datetime
    end: datetime
    events: list[CalendarEvent]
    spaces: list[CalendarSpace]
    truncated: bool = False
