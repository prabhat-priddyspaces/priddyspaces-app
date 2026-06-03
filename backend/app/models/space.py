from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, Integer, Numeric, String, Time

from app.models.base import Base
from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin

class Space(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    space_type = Column(
        Enum(SpaceType, values_callable=enum_values),
        nullable=False,
    )
    size_sqft = Column(Float, nullable=True)
    capacity = Column(Integer, nullable=False, default=1, server_default="1")
    price_monthly = Column(Numeric(12, 2), nullable=True)
    price_daily = Column(Numeric(12, 2), nullable=True)
    price_hourly = Column(Numeric(12, 2), nullable=True)
    availability_status = Column(
        Enum(AvailabilityStatus, values_callable=enum_values),
        nullable=False,
        default=AvailabilityStatus.AVAILABLE,
        server_default="available",
    )
    availability_start_time = Column(Time, nullable=True)
    availability_end_time = Column(Time, nullable=True)
    buffer_before_minutes = Column(Integer, nullable=False, default=0, server_default="0")
    buffer_after_minutes = Column(Integer, nullable=False, default=0, server_default="0")
    visibility = Column(
        Enum(
            SpaceVisibility,
            name="spacevisibility",
            values_callable=enum_values,
        ),
        nullable=False,
        default=SpaceVisibility.PUBLIC,
        server_default="public",
    )
    priddy_points_enabled = Column(Boolean, nullable=True)
    owner_points_enabled = Column(Boolean, nullable=True)
    amenities = Column(String(1024), nullable=True)
    floor_plan_id = Column(Integer, ForeignKey("floor_plans.id", ondelete="SET NULL"), nullable=True)
