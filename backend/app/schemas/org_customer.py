from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class OrgCustomerStats(BaseModel):
    total_bookings: int
    confirmed_bookings: int
    canceled_bookings: int
    no_shows: int
    open_requests: int
    total_revenue_cents: int
    active_subscriptions: int
    first_booking_at: Optional[datetime] = None
    last_booking_at: Optional[datetime] = None


class OrgCustomerListItem(BaseModel):
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
    stats: OrgCustomerStats

    model_config = ConfigDict(from_attributes=True)


class OrgCustomerDetail(BaseModel):
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
    stats: OrgCustomerStats

    model_config = ConfigDict(from_attributes=True)


class OrgCustomerUpdate(BaseModel):
    status: Optional[str] = None
    phone: Optional[str] = None
    company_name: Optional[str] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None
