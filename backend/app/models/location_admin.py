from sqlalchemy import Column, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class LocationAdmin(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "location_admins"

    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
