from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class LocationAdmin(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "location_admins"
    __table_args__ = (
        UniqueConstraint("location_id", "user_id", name="uq_location_admins_location_user"),
    )

    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
