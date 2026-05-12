from sqlalchemy import Column, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class CancellationPolicyTier(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "cancellation_policy_tiers"

    id = Column(Integer, primary_key=True)
    cancellation_policy_id = Column(Integer, nullable=False, index=True)
    min_hours_before_start = Column(Integer, nullable=False)
    refund_percent = Column(Integer, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
