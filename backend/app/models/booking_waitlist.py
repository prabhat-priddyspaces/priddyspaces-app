from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingWaitlistEntry(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_waitlist_entries"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    organization_id = Column(Integer, nullable=False, index=True)
    location_id = Column(Integer, nullable=False, index=True)
    space_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    membership_plan_id = Column(Integer, nullable=True, index=True)
    booking_request_id = Column(Integer, nullable=True, index=True)

    request_kind = Column(String(32), nullable=False, default="hourly_booking", server_default="hourly_booking")
    booking_mode = Column(String(32), nullable=True)
    full_day = Column(Boolean, nullable=False, default=False, server_default="false")
    seats_requested = Column(Integer, nullable=False, default=1, server_default="1")
    start_datetime = Column(DateTime(timezone=True), nullable=True)
    end_datetime = Column(DateTime(timezone=True), nullable=True)
    desired_start_date = Column(Date, nullable=True)

    status = Column(String(32), nullable=False, default="waitlisted", server_default="waitlisted", index=True)
    invited_at = Column(DateTime(timezone=True), nullable=True)
    invite_expires_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    booked_at = Column(DateTime(timezone=True), nullable=True)
    operator_notes = Column(String(1024), nullable=True)
