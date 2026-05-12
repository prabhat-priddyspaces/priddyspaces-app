from sqlalchemy import Boolean, Column, Date, DateTime, Enum, Integer, String

from app.models.base import Base
from app.models.enums import BookingRequestStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingRequest(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=True)
    space_id = Column(Integer, nullable=False)
    booking_id = Column(Integer, nullable=True)
    booking_series_id = Column(Integer, nullable=True, index=True)
    owner_payment_setting_id = Column(Integer, nullable=True)
    payment_provider = Column(String(32), nullable=True)
    member_owner_payment_method_id = Column(Integer, nullable=True)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        Enum(BookingRequestStatus, values_callable=enum_values),
        default=BookingRequestStatus.REQUESTED,
    )
    payment_status = Column(String(32), nullable=True)
    instant_booking = Column(Boolean, nullable=False, default=False, server_default="false")
    recurrence_frequency = Column(String(16), nullable=True)
    recurrence_interval = Column(Integer, nullable=True)
    recurrence_count = Column(Integer, nullable=True)
    recurrence_until_date = Column(Date, nullable=True)
    occurrence_count = Column(Integer, nullable=False, default=1, server_default="1")
    pricing_snapshot = Column(String(4096), nullable=True)
    refund_policy_snapshot = Column(String(4096), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_deadline_at = Column(DateTime(timezone=True), nullable=True)
    payment_authorization_consent_at = Column(DateTime(timezone=True), nullable=True)
    payment_attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    operator_notes = Column(String(1024), nullable=True)

    request_kind = Column(
        String(32),
        nullable=False,
        default="hourly_booking",
        server_default="hourly_booking",
    )
    membership_plan_id = Column(Integer, nullable=True)
    desired_start_date = Column(Date, nullable=True)
    seats_requested = Column(Integer, nullable=False, default=1, server_default="1")
    commitment_months_snapshot = Column(Integer, nullable=True)

    is_guest_checkout = Column(Boolean, nullable=False, default=False, server_default="false")
    guest_email = Column(String(255), nullable=True)
    guest_full_name = Column(String(255), nullable=True)
    guest_phone = Column(String(64), nullable=True)
    guest_company_name = Column(String(255), nullable=True)
    guest_notes = Column(String(1024), nullable=True)
    guest_token = Column(String(64), nullable=True, unique=True)
    guest_token_expires_at = Column(DateTime(timezone=True), nullable=True)
