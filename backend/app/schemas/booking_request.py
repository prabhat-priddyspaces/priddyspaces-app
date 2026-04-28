from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import BookingRequestStatus


class BookingRequestCreate(BaseModel):
    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime
    customer_owner_payment_method_public_id: str | None = None
    payment_authorization_consent: bool = False


class BookingPaymentSummary(BaseModel):
    status: str | None = None
    amount: int | None = None
    amount_cents: int | None = None
    currency: str | None = None
    attempt_number: int | None = None
    failure_reason: str | None = None
    attempted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingRequestOut(BaseModel):
    public_id: str
    space_id: int
    space_public_id: str | None = None
    user_id: int
    booking_id: int | None = None
    booking_public_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    status: BookingRequestStatus
    payment_status: str | None = None
    payment_provider: str | None = None
    customer_owner_payment_method_public_id: str | None = None
    approved_at: datetime | None = None
    cancelled_at: datetime | None = None
    cancellation_deadline_at: datetime | None = None
    payment_authorization_consent_at: datetime | None = None
    operator_notes: str | None = None
    price_daily: int | None = None
    price_monthly: int | None = None
    estimated_amount: int | None = None
    payment_attempt_count: int | None = None
    failure_reason: str | None = None
    last_payment: BookingPaymentSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingRequestDecision(BaseModel):
    operator_notes: str | None = None


class BookingRequestRetryPayment(BaseModel):
    operator_notes: str | None = None
