from sqlalchemy import Column, DateTime, Enum, Integer, String

from app.models.base import Base
from app.models.enums import BookingRequestStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingRequest(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False)
    booking_id = Column(Integer, nullable=True)
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    status = Column(
        Enum(BookingRequestStatus, values_callable=enum_values),
        default=BookingRequestStatus.REQUESTED,
    )
    operator_notes = Column(String(1024), nullable=True)
