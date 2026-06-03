from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String

from app.models.base import Base
from app.models.enums import BookingStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Booking(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    inventory_start_datetime = Column(DateTime(timezone=True), nullable=True)
    inventory_end_datetime = Column(DateTime(timezone=True), nullable=True)
    blocks_inventory = Column(Boolean, nullable=False, server_default="true", default=True)
    booking_series_id = Column(Integer, ForeignKey("booking_series.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    recurrence_sequence = Column(Integer, nullable=True)
    status = Column(
        Enum(BookingStatus, values_callable=enum_values),
        nullable=False,
        default=BookingStatus.PENDING,
        server_default="pending",
        index=True,
    )
    stripe_payment_intent_id = Column(String(255), nullable=True)
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    checked_out_at = Column(DateTime(timezone=True), nullable=True)
    no_show = Column(Boolean, nullable=False, server_default="false", default=False)
