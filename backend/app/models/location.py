from sqlalchemy import Boolean, Column, Enum, Float, ForeignKey, Integer, JSON, String

from app.models.base import Base
from app.models.enums import BookingGranularity, LocationStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Location(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
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
    public_working_hours_enabled = Column(Boolean, nullable=False, default=False)
    public_working_hours = Column(JSON, nullable=False, default=list)
    public_parking_notes = Column(String(2048), nullable=True)
    public_transit_notes = Column(String(2048), nullable=True)
    public_included_items = Column(String(2048), nullable=True)
    payment_provider = Column(String(32), nullable=True)
    status = Column(
        Enum(LocationStatus, values_callable=enum_values),
        default=LocationStatus.ACTIVE,
    )
    booking_granularity = Column(
        Enum(BookingGranularity, values_callable=enum_values),
        default=BookingGranularity.MIN_60,
    )
