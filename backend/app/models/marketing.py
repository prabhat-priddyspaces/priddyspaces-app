from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class MarketingTemplate(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "marketing_templates"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    html_body = Column(Text, nullable=True)
    text_body = Column(Text, nullable=True)
    category = Column(String(64), nullable=True)
    classification = Column(String(64), nullable=True)
    variables = Column(JSON, nullable=False, default=list)
    is_archived = Column(Boolean, nullable=False, default=False, server_default="false")
    created_by_user_id = Column(Integer, nullable=True)
    updated_by_user_id = Column(Integer, nullable=True)


class AudienceSegment(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "audience_segments"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    filters = Column(JSON, nullable=False, default=dict)
    preview_count = Column(Integer, nullable=False, default=0, server_default="0")
    last_previewed_at = Column(DateTime(timezone=True), nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False, server_default="false")
    created_by_user_id = Column(Integer, nullable=True)


class MarketingCampaign(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "marketing_campaigns"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="draft", server_default="draft")
    template_id = Column(Integer, nullable=False, index=True)
    segment_id = Column(Integer, nullable=True, index=True)
    snapshot_filters = Column(JSON, nullable=True)
    sender_lane = Column(String(32), nullable=False, default="shared", server_default="shared")
    scheduled_at = Column(DateTime(timezone=True), nullable=True, index=True)
    sent_started_at = Column(DateTime(timezone=True), nullable=True)
    sent_finished_at = Column(DateTime(timezone=True), nullable=True)
    canceled_at = Column(DateTime(timezone=True), nullable=True)
    total_count = Column(Integer, nullable=False, default=0, server_default="0")
    eligible_count = Column(Integer, nullable=False, default=0, server_default="0")
    suppressed_count = Column(Integer, nullable=False, default=0, server_default="0")
    no_email_count = Column(Integer, nullable=False, default=0, server_default="0")
    queued_count = Column(Integer, nullable=False, default=0, server_default="0")
    sent_count = Column(Integer, nullable=False, default=0, server_default="0")
    delivered_count = Column(Integer, nullable=False, default=0, server_default="0")
    opened_count = Column(Integer, nullable=False, default=0, server_default="0")
    clicked_count = Column(Integer, nullable=False, default=0, server_default="0")
    bounced_count = Column(Integer, nullable=False, default=0, server_default="0")
    failed_count = Column(Integer, nullable=False, default=0, server_default="0")
    unsubscribed_count = Column(Integer, nullable=False, default=0, server_default="0")
    created_by_user_id = Column(Integer, nullable=True)


class CampaignRecipient(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (
        UniqueConstraint("campaign_id", "user_id", name="uq_campaign_recipients_campaign_user"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    campaign_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="queued", server_default="queued")
    suppression_reason = Column(String(64), nullable=True)
    rendered_subject = Column(String(255), nullable=True)
    rendered_html = Column(Text, nullable=True)
    rendered_text = Column(Text, nullable=True)
    provider_message_id = Column(String(255), nullable=True, index=True)
    outbound_message_id = Column(Integer, nullable=True, index=True)


class OutboundMessage(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "outbound_messages"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    campaign_id = Column(Integer, nullable=True, index=True)
    campaign_recipient_id = Column(Integer, nullable=True, index=True)
    workflow_id = Column(Integer, nullable=True, index=True)
    workflow_run_id = Column(Integer, nullable=True, index=True)
    template_id = Column(Integer, nullable=True, index=True)
    email = Column(String(320), nullable=False, index=True)
    subject = Column(String(255), nullable=False)
    html_body = Column(Text, nullable=True)
    text_body = Column(Text, nullable=True)
    sender_lane = Column(String(32), nullable=False)
    from_email = Column(String(320), nullable=False)
    from_name = Column(String(255), nullable=True)
    provider = Column(String(64), nullable=False, default="sendgrid", server_default="sendgrid")
    provider_message_id = Column(String(255), nullable=True, index=True)
    status = Column(String(32), nullable=False, default="queued", server_default="queued", index=True)
    error = Column(Text, nullable=True)
    opens = Column(Integer, nullable=False, default=0, server_default="0")
    clicks = Column(Integer, nullable=False, default=0, server_default="0")
    last_event_at = Column(DateTime(timezone=True), nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    source = Column(String(64), nullable=False, default="campaign", server_default="campaign")
    source_context = Column(JSON, nullable=False, default=dict)


class EmailSuppression(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "email_suppressions"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_email_suppressions_org_email"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    email = Column(String(320), nullable=False, index=True)
    reason = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    source = Column(String(64), nullable=False, default="manual", server_default="manual")
    source_event_id = Column(String(255), nullable=True)
    resubscribed_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)


class Workflow(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="draft", server_default="draft")
    graph = Column(JSON, nullable=False, default=dict)
    current_version_id = Column(Integer, ForeignKey("workflow_versions.id", deferrable=True, initially="DEFERRED"), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)


class WorkflowVersion(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "workflow_versions"
    __table_args__ = (
        UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_number"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    workflow_id = Column(Integer, nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    graph = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="published", server_default="published")
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by_user_id = Column(Integer, nullable=True)


class WorkflowRun(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "workflow_runs"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    workflow_id = Column(Integer, nullable=False, index=True)
    workflow_version_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="running", server_default="running", index=True)
    current_node_id = Column(String(255), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True, index=True)
    context = Column(JSON, nullable=False, default=dict)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)


class WorkflowRunEvent(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "workflow_run_events"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    workflow_id = Column(Integer, nullable=False, index=True)
    workflow_run_id = Column(Integer, nullable=False, index=True)
    node_id = Column(String(255), nullable=True)
    event_type = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="completed", server_default="completed")
    message = Column(Text, nullable=True)
    data = Column(JSON, nullable=False, default=dict)


class MarketingVerifiedSender(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "marketing_verified_senders"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_marketing_verified_senders_org_email"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    sendgrid_sender_id = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="pending", server_default="pending")
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)


class BusinessMarketingSenderSetting(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "business_marketing_sender_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_business_marketing_sender_settings_org"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    default_sender_lane = Column(String(32), nullable=False, default="shared", server_default="shared")
    verified_sender_id = Column(Integer, nullable=True, index=True)
    shared_from_email = Column(String(320), nullable=True)
    shared_from_name = Column(String(255), nullable=True)
    quiet_hours_start = Column(String(8), nullable=True)
    quiet_hours_end = Column(String(8), nullable=True)
    updated_by_user_id = Column(Integer, nullable=True)
