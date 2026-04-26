from sqlalchemy import Column, Integer, String, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class AuditLog(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    actor_id = Column(Integer, nullable=False)
    acting_as_user_id = Column(Integer, nullable=True)
    action = Column(String(128), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_public_id = Column(String(36), nullable=False)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    context = Column(JSON, nullable=True)
