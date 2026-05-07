from sqlalchemy import Column, DateTime, Integer, JSON, String, Text

from app.models.base import Base
from app.models.mixins import PublicIdMixin


class EmailEvent(PublicIdMixin, Base):
    __tablename__ = "email_events"

    id = Column(Integer, primary_key=True)
    sg_event_id = Column(String(255), nullable=False, unique=True, index=True)
    sg_message_id = Column(String(255), nullable=True, index=True)
    email = Column(String(320), nullable=False, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    reason = Column(Text, nullable=True)
    status = Column(String(64), nullable=True)
    response = Column(Text, nullable=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    url = Column(Text, nullable=True)
    asm_group_id = Column(Integer, nullable=True)
    sg_event_timestamp = Column(DateTime(timezone=True), nullable=True)
    payload = Column(JSON, nullable=False)
    user_id = Column(Integer, nullable=True, index=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
