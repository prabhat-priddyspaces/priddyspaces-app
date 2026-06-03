from sqlalchemy import Column, ForeignKey, Index, Integer, String, Boolean, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class FeatureFlag(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "feature_flags"
    __table_args__ = (
        UniqueConstraint("tenant_id", "flag_key", "scope_type", "scope_id", name="uq_feature_flags_tenant_key_scope"),
        Index("ix_feature_flags_scope", "scope_type", "scope_id"),
    )

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    flag_key = Column(String(64), nullable=False)
    flag_value = Column(Boolean, nullable=False, default=False, server_default="false")
    scope_type = Column(String(16), nullable=False)  # tenant | space
    scope_id = Column(Integer, nullable=False)
