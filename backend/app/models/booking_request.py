from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, String

from app.models.base import Base
from app.models.enums import BookingRequestKind, BookingRequestStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingRequest(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True)
    booking_series_id = Column(Integer, ForeignKey("booking_series.id", ondelete="SET NULL"), nullable=True, index=True)
    owner_payment_setting_id = Column(Integer, ForeignKey("owner_payment_settings.id", ondelete="SET NULL"), nullable=True)
    payment_provider = Column(String(32), nullable=True)
    member_owner_payment_method_id = Column(Integer, ForeignKey("member_owner_payment_methods.id", ondelete="SET NULL"), nullable=True)
    loyalty_redemption_lock_id = Column(Integer, ForeignKey("loyalty_redemption_locks.id", ondelete="SET NULL"), nullable=True)
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
    rejected_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_deadline_at = Column(DateTime(timezone=True), nullable=True)
    payment_hold_expires_at = Column(DateTime(timezone=True), nullable=True)
    payment_failed_at = Column(DateTime(timezone=True), nullable=True)
    payment_authorization_consent_at = Column(DateTime(timezone=True), nullable=True)
    payment_attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    operator_notes = Column(String(1024), nullable=True)
    source = Column(String(32), nullable=False, default="member", server_default="member")
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    payment_collection_mode = Column(String(32), nullable=True)

    request_kind = Column(
        Enum(BookingRequestKind, values_callable=enum_values),
        nullable=False,
        default=BookingRequestKind.HOURLY_BOOKING,
        server_default="hourly_booking",
    )
    membership_plan_id = Column(Integer, ForeignKey("membership_plans.id", ondelete="SET NULL"), nullable=True)
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
