from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class CancellationPolicy(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "cancellation_policies"
    __table_args__ = (
        UniqueConstraint("tenant_id", "space_type", name="uq_cancellation_policies_tenant_space_type"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_type = Column(String(32), nullable=False)
    cancel_window_hours = Column(Integer, nullable=False, default=24)
    refund_percent = Column(Integer, nullable=False, default=0)
