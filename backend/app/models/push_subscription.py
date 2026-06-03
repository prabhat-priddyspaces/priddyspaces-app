from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PushSubscription(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    provider = Column(String(16), nullable=False, index=True)
    endpoint_hash = Column(String(128), nullable=False, unique=True, index=True)
    subscription_encrypted = Column(String(4096), nullable=False)
    user_agent = Column(String(512), nullable=True)
    device_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(1024), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
