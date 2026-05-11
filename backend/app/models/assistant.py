from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class AssistantConversation(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_conversations"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(128), nullable=True, index=True)
    audience = Column(String(32), nullable=False, default="anonymous")
    tenant_id = Column(Integer, nullable=True, index=True)
    organization_id = Column(Integer, nullable=True, index=True)
    accessible_location_ids = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)
    escalation_state = Column(String(32), nullable=False, default="none")
    title = Column(String(255), nullable=True)
    last_message_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class AssistantMessage(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    role = Column(String(32), nullable=False)
    content = Column(Text, nullable=False, default="")
    tool_calls = Column(JSON, nullable=True)
    citations = Column(JSON, nullable=True)
    proposals = Column(JSON, nullable=True)
    usage = Column(JSON, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    redaction_counts = Column(JSON, nullable=True)
    estimated_cost_usd = Column(Float, nullable=False, default=0.0)
    model = Column(String(128), nullable=True)
    event_metadata = Column(JSON, nullable=True)


class AssistantFeedback(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_feedback"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    message_id = Column(Integer, nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(128), nullable=True, index=True)
    rating = Column(String(16), nullable=False)
    reason = Column(Text, nullable=True)
    event_metadata = Column(JSON, nullable=True)


class AssistantRateLimit(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "assistant_rate_limits"

    id = Column(Integer, primary_key=True)
    identifier = Column(String(255), nullable=False, index=True)
    audience = Column(String(32), nullable=False, index=True)
    window_type = Column(String(16), nullable=False)
    window_start = Column(DateTime(timezone=True), nullable=False, index=True)
    request_count = Column(Integer, nullable=False, default=0)
    token_count = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Float, nullable=False, default=0.0)


class SupportTicket(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(128), nullable=True, index=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    status = Column(String(32), nullable=False, default="open")
    subject = Column(String(255), nullable=False)
    requester_email = Column(String(255), nullable=True)
    transcript = Column(JSON, nullable=True)
    event_metadata = Column(JSON, nullable=True)


class SpaceAlert(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_alerts"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(128), nullable=True, index=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    search_filters = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="active")
    is_active = Column(Boolean, nullable=False, default=True)
    matched_at = Column(DateTime(timezone=True), nullable=True)
    last_notified_at = Column(DateTime(timezone=True), nullable=True)
    notification_count = Column(Integer, nullable=False, default=0)


class OwnerPolicyKB(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "owner_policy_kb"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    organization_id = Column(Integer, nullable=False, index=True)
    location_id = Column(Integer, nullable=True, index=True)
    space_id = Column(Integer, nullable=True, index=True)
    category = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    source_url = Column(String(1024), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    updated_by_user_id = Column(Integer, nullable=True, index=True)
