from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrganizationReviewStatus


class OrganizationCreate(BaseModel):
    name: str


class OrganizationUpdate(BaseModel):
    name: str | None = None
    branding: str | None = None
    resubmit_for_review: bool = False


class OrganizationOut(BaseModel):
    public_id: str
    name: str
    branding: str | None = None
    review_status: OrganizationReviewStatus
    review_notes: str | None = None
    reviewed_at: datetime | None = None
    commission_override_pct: int | None = None
    booking_approval_mode: Literal["manual", "auto"] = "manual"
    payment_failure_hold_minutes: int = 30
    model_config = ConfigDict(from_attributes=True)


class OrganizationApprovalRequestOut(BaseModel):
    public_id: str
    review_status: OrganizationReviewStatus
    recipients_notified: int


class OrganizationBookingSettingsOut(BaseModel):
    public_id: str
    name: str
    booking_approval_mode: Literal["manual", "auto"] = "manual"
    payment_failure_hold_minutes: int = 30

    model_config = ConfigDict(from_attributes=True)


class OrganizationBookingSettingsUpdate(BaseModel):
    booking_approval_mode: Literal["manual", "auto"] | None = None
    payment_failure_hold_minutes: int | None = Field(default=None, ge=0)
