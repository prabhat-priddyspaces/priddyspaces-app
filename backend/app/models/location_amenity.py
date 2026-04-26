from sqlalchemy import Column, DateTime, Integer, func

from app.models.base import Base


class LocationAmenity(Base):
    __tablename__ = "location_amenities"

    location_id = Column(Integer, primary_key=True)
    organization_amenity_id = Column(Integer, primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
