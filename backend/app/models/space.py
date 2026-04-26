from sqlalchemy import Column, Enum, Integer, Float, Time, String

from app.models.base import Base
from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin

class Space(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    name = Column(String(255), nullable=True)
    space_type = Column(
        Enum(SpaceType, values_callable=enum_values),
        nullable=False,
    )
    size_sqft = Column(Float, nullable=True)
    capacity = Column(Integer, default=1)
    price_monthly = Column(Integer, nullable=True)
    price_daily = Column(Integer, nullable=True)
    availability_status = Column(
        Enum(AvailabilityStatus, values_callable=enum_values),
        default=AvailabilityStatus.AVAILABLE,
    )
    availability_start_time = Column(Time, nullable=True)
    availability_end_time = Column(Time, nullable=True)
    visibility = Column(
        Enum(
            SpaceVisibility,
            name="spacevisibility",
            values_callable=enum_values,
        ),
        default=SpaceVisibility.PUBLIC,
    )
    amenities = Column(String(1024), nullable=True)
    floor_plan_id = Column(Integer, nullable=True)
