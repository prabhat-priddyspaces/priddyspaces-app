from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AssistantCitation(BaseModel):
    type: str
    id: str
    url: str
    title: str | None = None


class AssistantProposalEndpoint(BaseModel):
    method: str
    path: str


class AssistantProposal(BaseModel):
    proposal_id: str
    kind: str
    summary: str
    endpoint: AssistantProposalEndpoint
    payload: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    expires_at: datetime
    status: str = "pending"


class AssistantClientAction(BaseModel):
    action_id: str
    kind: str
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class AssistantMessageOut(BaseModel):
    public_id: str
    role: str
    content: str
    citations: list[AssistantCitation] = Field(default_factory=list)
    proposals: list[AssistantProposal] = Field(default_factory=list)
    client_actions: list[AssistantClientAction] = Field(default_factory=list)
    created_at: datetime | None = None


class AssistantChatIn(BaseModel):
    message: str
    conversation_public_id: str | None = None
    guest_id: str | None = None
    page_context: dict[str, Any] = Field(default_factory=dict)


class AssistantChatResponse(BaseModel):
    enabled: bool
    disabled_reason: str | None = None
    conversation_public_id: str | None = None
    guest_id: str | None = None
    message: AssistantMessageOut | None = None
    rate_limited: bool = False
    cost_capped: bool = False


class AssistantConversationOut(BaseModel):
    public_id: str
    audience: str
    title: str | None = None
    summary: str | None = None
    escalation_state: str
    last_message_at: datetime | None = None
    messages: list[AssistantMessageOut] = Field(default_factory=list)


class AssistantFeedbackIn(BaseModel):
    message_public_id: str | None = None
    rating: str
    reason: str | None = None
    guest_id: str | None = None


class AssistantProposalActionIn(BaseModel):
    guest_id: str | None = None


class AssistantProposalActionOut(BaseModel):
    proposal_id: str
    status: str
    result: dict[str, Any] | None = None


class AssistantEscalationIn(BaseModel):
    guest_id: str | None = None
    requester_email: str | None = None
    subject: str | None = None


class SupportTicketOut(BaseModel):
    public_id: str
    status: str
    subject: str
    requester_email: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class OwnerPolicyKBIn(BaseModel):
    scope_type: str = "organization"
    scope_public_id: str
    category: str
    title: str
    body: str
    source_url: str | None = None


class OwnerPolicyKBUpdateIn(BaseModel):
    category: str | None = None
    title: str | None = None
    body: str | None = None
    source_url: str | None = None
    is_active: bool | None = None


class OwnerPolicyKBOut(BaseModel):
    public_id: str
    scope_type: str
    scope_public_id: str
    category: str
    title: str
    body: str
    source_url: str | None = None
    is_active: bool
    updated_at: datetime | None = None


class AssistantQualityOut(BaseModel):
    metrics: dict[str, Any]
    low_rated_conversations: list[dict[str, Any]]
    missing_policy_categories: list[dict[str, Any]]
    reliability_events: list[dict[str, Any]] = Field(default_factory=list)
    recent_reliability_events: list[dict[str, Any]] = Field(default_factory=list)
    tool_failure_rates: list[dict[str, Any]]
    usage_by_persona: list[dict[str, Any]]
    abandoned_booking_drafts: list[dict[str, Any]]
