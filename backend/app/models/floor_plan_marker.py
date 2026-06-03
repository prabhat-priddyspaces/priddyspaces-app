from sqlalchemy import Column, Float, ForeignKey, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class FloorPlanMarker(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "floor_plan_markers"

    id = Column(Integer, primary_key=True)
    floor_plan_id = Column(Integer, ForeignKey("floor_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    x_coordinate = Column(Float, nullable=False)
    y_coordinate = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
