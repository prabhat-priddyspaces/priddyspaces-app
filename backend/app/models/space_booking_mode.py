from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceBookingMode(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_booking_modes"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    booking_mode = Column(String(32), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True, server_default="true")

    __table_args__ = (
        UniqueConstraint("space_id", "booking_mode", name="uq_space_booking_modes_space_mode"),
    )
