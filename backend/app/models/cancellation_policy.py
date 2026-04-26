from sqlalchemy import Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class CancellationPolicy(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "cancellation_policies"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    space_type = Column(String(32), nullable=False)
    cancel_window_hours = Column(Integer, nullable=False, default=24)
    refund_percent = Column(Integer, nullable=False, default=0)
