from sqlalchemy import Column, ForeignKey, Index, Integer, String, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class AuditLog(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_entity_type_public_id", "entity_type", "entity_public_id"),
    )

    id = Column(Integer, primary_key=True)
    # actor_id=0 is a sentinel for system/webhook actors — no FK constraint
    actor_id = Column(Integer, nullable=False, index=True)
    acting_as_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True)
    action = Column(String(128), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_public_id = Column(String(36), nullable=False)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    context = Column(JSON, nullable=True)
