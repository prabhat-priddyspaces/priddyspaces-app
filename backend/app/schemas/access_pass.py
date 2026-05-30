from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AccessPassEnsureIn(BaseModel):
    booking_public_id: str


class AccessPassTokenIn(BaseModel):
    token: str = Field(min_length=8)


class AccessPassOut(BaseModel):
    public_id: str
    booking_public_id: str
    booking_request_public_id: str | None = None
    qr_payload: str
    status: str
    pass_status: str
    valid_from_at: datetime
    expires_at: datetime
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    member_name: str | None = None
    member_email: str | None = None
    location_public_id: str
    location_name: str
    space_public_id: str
    space_name: str | None = None
    space_type: str
    start_datetime: datetime
    end_datetime: datetime

    model_config = ConfigDict(from_attributes=True)


class AccessPassResolveOut(BaseModel):
    public_id: str | None = None
    booking_public_id: str | None = None
    booking_request_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    space_public_id: str | None = None
    space_name: str | None = None
    space_type: str | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    pass_status: str
    can_check_in: bool = False
    can_check_out: bool = False
    message: str | None = None


class AttendanceRecordOut(BaseModel):
    public_id: str | None = None
    booking_public_id: str
    access_pass_public_id: str | None = None
    member_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    scanned_by_public_id: str | None = None
    scanned_by_name: str | None = None
    location_public_id: str
    location_name: str
    space_public_id: str
    space_name: str | None = None
    space_type: str
    start_datetime: datetime
    end_datetime: datetime
    checked_in_at: datetime | None = None
    checked_out_at: datetime | None = None
    status: str
    event_type: str | None = None
    event_at: datetime | None = None


class AttendanceListOut(BaseModel):
    results: list[AttendanceRecordOut]
    total: int
    page: int
    page_size: int


class MemberDirectoryItemOut(BaseModel):
    member_public_id: str
    name: str | None = None
    email: str
    location_public_id: str
    location_name: str
    space_public_id: str
    space_name: str | None = None
    space_type: str
    last_seen_at: datetime | None = None
