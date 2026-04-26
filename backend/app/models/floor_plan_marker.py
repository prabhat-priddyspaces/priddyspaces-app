from sqlalchemy import Column, Integer, Float

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class FloorPlanMarker(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "floor_plan_markers"

    id = Column(Integer, primary_key=True)
    floor_plan_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    x_coordinate = Column(Float, nullable=False)
    y_coordinate = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
