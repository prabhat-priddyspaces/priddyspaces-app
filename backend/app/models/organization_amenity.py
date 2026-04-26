from sqlalchemy import Column, DateTime, Integer, String

from app.models.base import Base
from app.models.mixins import TimestampMixin


class OrganizationAmenity(TimestampMixin, Base):
    __tablename__ = "organization_amenities"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(120), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
