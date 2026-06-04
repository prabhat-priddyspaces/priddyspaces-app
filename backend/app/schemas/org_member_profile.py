from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.schemas._phone import PhoneStr


class OrgMemberProfileStats(BaseModel):
    total_bookings: int
    confirmed_bookings: int
    canceled_bookings: int
    no_shows: int
    open_requests: int
    total_revenue_cents: int
    active_subscriptions: int
    first_booking_at: Optional[datetime] = None
    last_booking_at: Optional[datetime] = None


class OrgMemberProfileListItem(BaseModel):
    user_public_id: str
    organization_public_id: str
    name: str
    email: str
    status: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    tags: list[str] = []
    notes_preview: Optional[str] = None
    materialized: bool = False
    stats: OrgMemberProfileStats

    model_config = ConfigDict(from_attributes=True)


class OrgMemberProfileDetail(BaseModel):
    user_public_id: str
    organization_public_id: str
    name: str
    email: str
    status: str
    phone: Optional[str] = None
    company_name: Optional[str] = None
    tags: list[str] = []
    notes: Optional[str] = None
    materialized: bool = False
    stats: OrgMemberProfileStats

    model_config = ConfigDict(from_attributes=True)


class OrgMemberProfileUpdate(BaseModel):
    status: Optional[str] = None
    phone: Optional[PhoneStr] = None
    company_name: Optional[str] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None
