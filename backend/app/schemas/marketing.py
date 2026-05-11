from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class MarketingTemplateBase(BaseModel):
    name: str
    subject: str
    html_body: str | None = None
    text_body: str | None = None
    category: str | None = None
    classification: str | None = None


class MarketingTemplateCreate(MarketingTemplateBase):
    organization_public_id: str | None = None


class MarketingTemplateUpdate(BaseModel):
    name: str | None = None
    subject: str | None = None
    html_body: str | None = None
    text_body: str | None = None
    category: str | None = None
    classification: str | None = None
    is_archived: bool | None = None


class MarketingTemplateOut(MarketingTemplateBase):
    public_id: str
    organization_public_id: str
    variables: list[str] = []
    is_archived: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TemplatePreviewIn(BaseModel):
    organization_public_id: str | None = None
    user_public_id: str | None = None
    context: dict[str, Any] | None = None


class TemplatePreviewOut(BaseModel):
    subject: str
    html_body: str | None = None
    text_body: str | None = None
    missing_values: list[str] = []


class TemplateTestSendIn(BaseModel):
    organization_public_id: str | None = None
    to_email: EmailStr | None = None
    user_public_id: str | None = None
    sender_lane: str | None = None


class SegmentBase(BaseModel):
    name: str
    description: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)


class SegmentCreate(SegmentBase):
    organization_public_id: str | None = None


class SegmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    filters: dict[str, Any] | None = None
    is_archived: bool | None = None


class SegmentOut(SegmentBase):
    public_id: str
    organization_public_id: str
    preview_count: int
    is_archived: bool
    last_previewed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class SegmentPreviewIn(BaseModel):
    organization_public_id: str | None = None
    filters: dict[str, Any] = Field(default_factory=dict)


class SegmentPreviewOut(BaseModel):
    total: int
    sample: list[dict[str, Any]] = []


class CampaignCreate(BaseModel):
    organization_public_id: str | None = None
    name: str
    template_public_id: str
    segment_public_id: str | None = None
    filters: dict[str, Any] | None = None
    sender_lane: str | None = None
    scheduled_at: datetime | None = None


class CampaignOut(BaseModel):
    public_id: str
    organization_public_id: str
    name: str
    status: str
    template_public_id: str
    segment_public_id: str | None = None
    sender_lane: str
    scheduled_at: datetime | None = None
    sent_started_at: datetime | None = None
    sent_finished_at: datetime | None = None
    total_count: int
    eligible_count: int
    suppressed_count: int
    no_email_count: int
    queued_count: int
    sent_count: int
    delivered_count: int
    opened_count: int
    clicked_count: int
    bounced_count: int
    failed_count: int
    unsubscribed_count: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CampaignSendIn(BaseModel):
    scheduled_at: datetime | None = None


class CampaignReviewOut(BaseModel):
    total: int
    eligible: int
    suppressed: int
    no_email: int
    already_snapshotted: int = 0


class CampaignRecipientOut(BaseModel):
    public_id: str
    user_public_id: str
    email: str
    status: str
    suppression_reason: str | None = None
    provider_message_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SuppressionCreate(BaseModel):
    organization_public_id: str | None = None
    email: EmailStr
    reason: str = "manual"


class SuppressionOut(BaseModel):
    public_id: str
    organization_public_id: str
    user_public_id: str | None = None
    email: str
    reason: str
    status: str
    source: str
    resubscribed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SenderSettingUpdate(BaseModel):
    organization_public_id: str | None = None
    default_sender_lane: str
    verified_sender_public_id: str | None = None


class VerifiedSenderCreate(BaseModel):
    organization_public_id: str | None = None
    email: EmailStr
    name: str | None = None


class VerifiedSenderOut(BaseModel):
    public_id: str
    email: str
    name: str | None = None
    status: str
    sendgrid_sender_id: str | None = None
    last_checked_at: datetime | None = None


class SenderSettingsOut(BaseModel):
    organization_public_id: str
    default_sender_lane: str
    allowed_lanes: list[str]
    shared_daily_cap: int
    verified_sender_daily_cap: int
    shared_from_email: str
    shared_from_name: str | None = None
    verified_sender_public_id: str | None = None
    verified_senders: list[VerifiedSenderOut] = []


class WorkflowCreate(BaseModel):
    organization_public_id: str | None = None
    name: str
    graph: dict[str, Any] = Field(default_factory=dict)


class WorkflowUpdate(BaseModel):
    name: str | None = None
    graph: dict[str, Any] | None = None


class WorkflowOut(BaseModel):
    public_id: str
    organization_public_id: str
    name: str
    status: str
    graph: dict[str, Any]
    current_version_public_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WorkflowVersionOut(BaseModel):
    public_id: str
    version_number: int
    graph: dict[str, Any]
    status: str
    published_at: datetime | None = None


class WorkflowRunOut(BaseModel):
    public_id: str
    workflow_public_id: str
    user_public_id: str
    status: str
    current_node_id: str | None = None
    next_run_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
