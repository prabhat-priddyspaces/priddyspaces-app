from datetime import datetime

from pydantic import BaseModel, ConfigDict


class OwnerPaymentHealthNoticeOut(BaseModel):
    public_id: str
    status: str
    subject: str | None = None
    error: str | None = None
    sent_at: datetime | None = None
    last_event_at: datetime | None = None
    created_at: datetime | None = None


class OwnerPaymentHealthAffectedSpaceOut(BaseModel):
    space_public_id: str
    space_name: str | None = None
    space_type: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None
    sources: list[str]
    open_request_count: int = 0
    future_booking_count: int = 0
    active_subscription_count: int = 0


class OwnerPaymentHealthCardOut(BaseModel):
    public_id: str
    organization_public_id: str
    organization_name: str
    member_public_id: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    provider: str
    payment_method_status: str
    card_status: str
    card_brand: str | None = None
    card_last4: str | None = None
    exp_month: int | None = None
    exp_year: int | None = None
    expiry_label: str | None = None
    is_default_for_owner: bool
    affected_spaces: list[OwnerPaymentHealthAffectedSpaceOut]
    open_booking_request_count: int
    future_booking_count: int
    active_subscription_count: int
    upcoming_booking_value_cents: int
    recent_paid_volume_cents: int
    last_notice: OwnerPaymentHealthNoticeOut | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class OwnerPaymentHealthSummaryOut(BaseModel):
    total_cards: int
    expired_count: int
    expiring_count: int
    missing_expiry_count: int
    healthy_count: int
    affected_member_count: int
    notices_sent_count: int
    upcoming_booking_value_cents: int
    recent_paid_volume_cents: int


class OwnerPaymentHealthCardsOut(BaseModel):
    generated_at: datetime
    summary: OwnerPaymentHealthSummaryOut
    results: list[OwnerPaymentHealthCardOut]


class OwnerPaymentHealthCardNoticeCreate(BaseModel):
    payment_method_public_ids: list[str]
    organization_public_id: str | None = None
    force: bool = False


class OwnerPaymentHealthCardNoticeResultOut(BaseModel):
    payment_method_public_id: str
    member_email: str | None = None
    status: str
    reason: str | None = None
    outbound_message_public_id: str | None = None
    outbound_status: str | None = None


class OwnerPaymentHealthCardNoticeOut(BaseModel):
    sent_count: int
    skipped_count: int
    failed_count: int
    results: list[OwnerPaymentHealthCardNoticeResultOut]
