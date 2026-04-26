from sqlalchemy import Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class FloorPlan(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "floor_plans"

    id = Column(Integer, primary_key=True)
    location_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    image_url = Column(String(1024), nullable=False)
    scale = Column(String(64), nullable=True)
    version = Column(Integer, default=1)
