from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PricingRule(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "pricing_rules"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    rate_type = Column(String(16), nullable=False)  # hourly | daily
    rate_amount = Column(Integer, nullable=False)
    active_from = Column(DateTime(timezone=True), nullable=True)
    active_to = Column(DateTime(timezone=True), nullable=True)
