from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceAttendanceRecord(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_attendance_records"
    __table_args__ = (
        UniqueConstraint("booking_id", "event_type", name="uq_space_attendance_booking_event"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    access_pass_id = Column(Integer, nullable=False, index=True)
    booking_id = Column(Integer, nullable=False, index=True)
    location_id = Column(Integer, nullable=False, index=True)
    space_id = Column(Integer, nullable=False, index=True)
    member_id = Column(Integer, nullable=False, index=True)
    scanned_by_user_id = Column(Integer, nullable=False, index=True)
    event_type = Column(String(16), nullable=False, index=True)
    status = Column(String(32), nullable=False, index=True)
    event_at = Column(DateTime(timezone=True), nullable=False, index=True)
