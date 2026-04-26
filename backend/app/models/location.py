from sqlalchemy import Column, Enum, Integer, String, Float

from app.models.base import Base
from app.models.enums import BookingGranularity, LocationStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Location(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    address = Column(String(512), nullable=False)
    city = Column(String(255), nullable=True)
    state = Column(String(128), nullable=True)
    postal_code = Column(String(32), nullable=True)
    neighborhood = Column(String(255), nullable=True)
    timezone = Column(String(64), nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    amenities = Column(String(1024), nullable=True)
    public_phone = Column(String(255), nullable=True)
    public_email = Column(String(255), nullable=True)
    public_hours_weekdays = Column(String(255), nullable=True)
    public_hours_weekends = Column(String(255), nullable=True)
    public_parking_notes = Column(String(2048), nullable=True)
    public_transit_notes = Column(String(2048), nullable=True)
    public_included_items = Column(String(2048), nullable=True)
    status = Column(
        Enum(LocationStatus, values_callable=enum_values),
        default=LocationStatus.ACTIVE,
    )
    booking_granularity = Column(
        Enum(BookingGranularity, values_callable=enum_values),
        default=BookingGranularity.MIN_60,
    )
