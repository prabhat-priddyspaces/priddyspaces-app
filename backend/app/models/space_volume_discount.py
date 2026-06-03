from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceVolumeDiscount(PublicIdMixin, TimestampMixin, Base):
    """A volume-discount tier on a single space.

    A space can have multiple tiers (e.g. 4 hrs = 10% off, 8 hrs = 20% off).
    The pricing engine picks the best applicable tier (highest discount_percent)
    when computing an hourly booking. Discounts apply only to the hourly path —
    not when a member selects "Full day" — because the day rate is already a
    separate price the owner sets.
    """
    __tablename__ = "space_volume_discounts"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    min_hours = Column(Float, nullable=False)
    discount_percent = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
