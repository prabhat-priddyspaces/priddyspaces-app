from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator


class OwnerBookingMemberCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=64)
    company_name: str | None = Field(default=None, max_length=255)


class OwnerBookingPreviewCreate(BaseModel):
    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime
    booking_mode: str = "hourly"
    full_day: bool = False
    seats_requested: int = Field(default=1, ge=1)
    override_amount_cents: int | None = Field(default=None, ge=0)
    override_reason: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _validate_mode(self):
        if self.booking_mode not in {"hourly", "day_pass"}:
            raise ValueError("booking_mode must be hourly or day_pass")
        if self.override_amount_cents is not None and not (self.override_reason or "").strip():
            raise ValueError("override_reason is required when overriding price")
        return self


class OwnerBookingCreate(OwnerBookingPreviewCreate):
    member_public_id: str | None = None
    member: OwnerBookingMemberCreate | None = None
    payment_collection_mode: str
    operator_notes: str | None = Field(default=None, max_length=1024)

    @model_validator(mode="after")
    def _validate_booking(self):
        if self.payment_collection_mode not in {"cash_collected", "payment_link"}:
            raise ValueError("payment_collection_mode must be cash_collected or payment_link")
        if bool(self.member_public_id) == bool(self.member):
            raise ValueError("Provide either member_public_id or member")
        return self


class OwnerBookingPreviewOut(BaseModel):
    currency: str = "usd"
    base_amount_cents: int
    discount_amount_cents: int = 0
    tax_amount_cents: int = 0
    total_amount_cents: int
    original_total_amount_cents: int | None = None
    override_applied: bool = False
    rate_basis: str | None = None
    units: float | None = None
    quantity: int = 1


class OwnerBookingOut(BaseModel):
    request_public_id: str
    booking_public_id: str | None = None
    status: str
    payment_status: str | None = None
    payment_collection_mode: str
    member_public_id: str
    member_email: str
    member_name: str | None = None
    total_amount_cents: int
    payment_link_url: str | None = None
    payment_link_expires_at: datetime | None = None
    registration_url: str | None = None


class BookingPaymentLinkPublicOut(BaseModel):
    public_id: str
    status: str
    expires_at: datetime
    request_public_id: str
    booking_public_id: str | None = None
    space_name: str | None = None
    location_name: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    member_email: str
    member_name: str | None = None
    amount_cents: int
    currency: str = "usd"
    provider: str
    publishable_key: str | None = None
    tokenizer_url: str | None = None


class BookingPaymentLinkStripeIntentOut(BaseModel):
    client_secret: str
    payment_intent_id: str
    publishable_key: str


class BookingPaymentLinkCardPointeCharge(BaseModel):
    card_token: str
    last4: str | None = None
    expiration: str | None = None
    brand: str | None = None
    billing_name: str | None = None
    billing_zip: str | None = None


class BookingPaymentLinkChargeOut(BaseModel):
    status: str
    request_public_id: str
    booking_public_id: str | None = None
    payment_public_id: str | None = None
