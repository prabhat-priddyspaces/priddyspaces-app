from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingSeries(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_series"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    recurrence_frequency = Column(String(16), nullable=False)
    recurrence_interval = Column(Integer, nullable=False, default=1, server_default="1")
    occurrence_count = Column(Integer, nullable=False)
    first_start_datetime = Column(DateTime(timezone=True), nullable=False)
    last_end_datetime = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), nullable=False, default="active", server_default="active")
