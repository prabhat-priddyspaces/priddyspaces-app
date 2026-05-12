from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String

from app.models.base import Base
from app.models.enums import BookingStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Booking(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    inventory_start_datetime = Column(DateTime(timezone=True), nullable=True)
    inventory_end_datetime = Column(DateTime(timezone=True), nullable=True)
    booking_series_id = Column(Integer, nullable=True, index=True)
    booking_request_id = Column(Integer, nullable=True, index=True)
    recurrence_sequence = Column(Integer, nullable=True)
    status = Column(
        Enum(BookingStatus, values_callable=enum_values),
        default=BookingStatus.PENDING,
    )
    stripe_payment_intent_id = Column(String(255), nullable=True)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    checked_out_at = Column(DateTime(timezone=True), nullable=True)
    no_show = Column(Boolean, nullable=False, server_default="false", default=False)
