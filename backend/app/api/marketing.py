from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.marketing import (
    AudienceSegment,
    CampaignRecipient,
    EmailSuppression,
    MarketingCampaign,
    MarketingTemplate,
    MarketingVerifiedSender,
    OutboundMessage,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
)
from app.models.organization import Organization
from app.models.user import User
from app.schemas.marketing import (
    CampaignCreate,
    CampaignOut,
    CampaignRecipientOut,
    CampaignReviewOut,
    CampaignSendIn,
    SegmentCreate,
    SegmentOut,
    SegmentPreviewIn,
    SegmentPreviewOut,
    SegmentUpdate,
    SenderSettingUpdate,
    SenderSettingsOut,
    SuppressionCreate,
    SuppressionOut,
    TemplatePreviewIn,
    TemplatePreviewOut,
    TemplateTestSendIn,
    MarketingTemplateCreate,
    MarketingTemplateOut,
    MarketingTemplateUpdate,
    VerifiedSenderCreate,
    VerifiedSenderOut,
    WorkflowCreate,
    WorkflowOut,
    WorkflowRunOut,
    WorkflowUpdate,
    WorkflowVersionOut,
)
from app.services import marketing as marketing_service
from app.services.auth_user import get_or_create_user

router = APIRouter(prefix="/marketing", tags=["marketing"])


def _actor(db: Session, token: dict) -> User:
    return get_or_create_user(db, token)


def _org_for_actor(db: Session, actor: User, organization_public_id: str | None) -> Organization:
    return marketing_service.resolve_marketing_org(db, actor.id, organization_public_id)


def _org_by_id_for_actor(db: Session, actor: User, organization_id: int) -> Organization:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return _org_for_actor(db, actor, org.public_id)


def _template_out(db: Session, template: MarketingTemplate) -> MarketingTemplateOut:
    org = db.query(Organization).filter(Organization.id == template.organization_id).first()
    return MarketingTemplateOut(
        public_id=template.public_id,
        organization_public_id=org.public_id if org else "",
        name=template.name,
        subject=template.subject,
        html_body=template.html_body,
        text_body=template.text_body,
        category=template.category,
        classification=template.classification,
        variables=template.variables or [],
        is_archived=template.is_archived,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _segment_out(db: Session, segment: AudienceSegment) -> SegmentOut:
    org = db.query(Organization).filter(Organization.id == segment.organization_id).first()
    return SegmentOut(
        public_id=segment.public_id,
        organization_public_id=org.public_id if org else "",
        name=segment.name,
        description=segment.description,
        filters=segment.filters or {},
        preview_count=segment.preview_count or 0,
        is_archived=segment.is_archived,
        last_previewed_at=segment.last_previewed_at,
        created_at=segment.created_at,
        updated_at=segment.updated_at,
    )


def _campaign_out(db: Session, campaign: MarketingCampaign) -> CampaignOut:
    org = db.query(Organization).filter(Organization.id == campaign.organization_id).first()
    template = db.query(MarketingTemplate).filter(MarketingTemplate.id == campaign.template_id).first()
    segment = db.query(AudienceSegment).filter(AudienceSegment.id == campaign.segment_id).first() if campaign.segment_id else None
    return CampaignOut(
        public_id=campaign.public_id,
        organization_public_id=org.public_id if org else "",
        name=campaign.name,
        status=campaign.status,
        template_public_id=template.public_id if template else "",
        segment_public_id=segment.public_id if segment else None,
        sender_lane=campaign.sender_lane,
        scheduled_at=campaign.scheduled_at,
        sent_started_at=campaign.sent_started_at,
        sent_finished_at=campaign.sent_finished_at,
        total_count=campaign.total_count or 0,
        eligible_count=campaign.eligible_count or 0,
        suppressed_count=campaign.suppressed_count or 0,
        no_email_count=campaign.no_email_count or 0,
        queued_count=campaign.queued_count or 0,
        sent_count=campaign.sent_count or 0,
        delivered_count=campaign.delivered_count or 0,
        opened_count=campaign.opened_count or 0,
        clicked_count=campaign.clicked_count or 0,
        bounced_count=campaign.bounced_count or 0,
        failed_count=campaign.failed_count or 0,
        unsubscribed_count=campaign.unsubscribed_count or 0,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


def _recipient_out(db: Session, recipient: CampaignRecipient) -> CampaignRecipientOut:
    user = db.query(User).filter(User.id == recipient.user_id).first()
    return CampaignRecipientOut(
        public_id=recipient.public_id,
        user_public_id=user.public_id if user else "",
        email=recipient.email,
        status=recipient.status,
        suppression_reason=recipient.suppression_reason,
        provider_message_id=recipient.provider_message_id,
        created_at=recipient.created_at,
        updated_at=recipient.updated_at,
    )


def _suppression_out(db: Session, suppression: EmailSuppression) -> SuppressionOut:
    org = db.query(Organization).filter(Organization.id == suppression.organization_id).first()
    user = db.query(User).filter(User.id == suppression.user_id).first() if suppression.user_id else None
    return SuppressionOut(
        public_id=suppression.public_id,
        organization_public_id=org.public_id if org else "",
        user_public_id=user.public_id if user else None,
        email=suppression.email,
        reason=suppression.reason,
        status=suppression.status,
        source=suppression.source,
        resubscribed_at=suppression.resubscribed_at,
        created_at=suppression.created_at,
        updated_at=suppression.updated_at,
    )


def _verified_sender_out(sender: MarketingVerifiedSender) -> VerifiedSenderOut:
    return VerifiedSenderOut(
        public_id=sender.public_id,
        email=sender.email,
        name=sender.name,
        status=sender.status,
        sendgrid_sender_id=sender.sendgrid_sender_id,
        last_checked_at=sender.last_checked_at,
    )


def _workflow_out(db: Session, workflow: Workflow) -> WorkflowOut:
    org = db.query(Organization).filter(Organization.id == workflow.organization_id).first()
    version = db.query(WorkflowVersion).filter(WorkflowVersion.id == workflow.current_version_id).first() if workflow.current_version_id else None
    return WorkflowOut(
        public_id=workflow.public_id,
        organization_public_id=org.public_id if org else "",
        name=workflow.name,
        status=workflow.status,
        graph=workflow.graph or {},
        current_version_public_id=version.public_id if version else None,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
    )


@router.get("/templates", response_model=list[MarketingTemplateOut])
def list_templates(
    organization_public_id: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    query = db.query(MarketingTemplate).filter(MarketingTemplate.organization_id == org.id)
    if not include_archived:
        query = query.filter(MarketingTemplate.is_archived.is_(False))
    templates = query.order_by(MarketingTemplate.updated_at.desc()).all()
    return [_template_out(db, template) for template in templates]


@router.post("/templates", response_model=MarketingTemplateOut)
def create_template(
    payload: MarketingTemplateCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    variables = marketing_service.ensure_template_allowed(payload.subject, payload.html_body, payload.text_body)
    template = MarketingTemplate(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        subject=payload.subject,
        html_body=payload.html_body,
        text_body=payload.text_body,
        category=payload.category,
        classification=payload.classification,
        variables=variables,
        created_by_user_id=actor.id,
        updated_by_user_id=actor.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_out(db, template)


@router.get("/templates/{template_public_id}", response_model=MarketingTemplateOut)
def get_template(
    template_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    template = db.query(MarketingTemplate).filter(MarketingTemplate.public_id == template_public_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    _org_by_id_for_actor(db, actor, template.organization_id)
    return _template_out(db, template)


@router.put("/templates/{template_public_id}", response_model=MarketingTemplateOut)
def update_template(
    template_public_id: str,
    payload: MarketingTemplateUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    template = db.query(MarketingTemplate).filter(MarketingTemplate.public_id == template_public_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    _org_by_id_for_actor(db, actor, template.organization_id)
    if payload.name is not None:
        template.name = payload.name
    if payload.subject is not None:
        template.subject = payload.subject
    if payload.html_body is not None:
        template.html_body = payload.html_body
    if payload.text_body is not None:
        template.text_body = payload.text_body
    if payload.category is not None:
        template.category = payload.category
    if payload.classification is not None:
        template.classification = payload.classification
    if payload.is_archived is not None:
        template.is_archived = payload.is_archived
    template.variables = marketing_service.ensure_template_allowed(template.subject, template.html_body, template.text_body)
    template.updated_by_user_id = actor.id
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_out(db, template)


@router.delete("/templates/{template_public_id}")
def delete_template(
    template_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    template = db.query(MarketingTemplate).filter(MarketingTemplate.public_id == template_public_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    _org_by_id_for_actor(db, actor, template.organization_id)
    template.is_archived = True
    db.add(template)
    db.commit()
    return {"archived": True}


@router.post("/templates/{template_public_id}/preview", response_model=TemplatePreviewOut)
def preview_template(
    template_public_id: str,
    payload: TemplatePreviewIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    template = db.query(MarketingTemplate).filter(MarketingTemplate.public_id == template_public_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    org = _org_by_id_for_actor(db, actor, template.organization_id)
    user = None
    if payload.user_public_id:
        user = db.query(User).filter(User.public_id == payload.user_public_id).first()
    context = marketing_service.member_context(db, org, user or actor, extra=payload.context)
    subject, html, text, missing = marketing_service.render_marketing_template(template, context)
    return TemplatePreviewOut(subject=subject, html_body=html, text_body=text, missing_values=missing)


@router.post("/templates/{template_public_id}/test-send")
def test_send_template(
    template_public_id: str,
    payload: TemplateTestSendIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    template = db.query(MarketingTemplate).filter(MarketingTemplate.public_id == template_public_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    org = _org_by_id_for_actor(db, actor, template.organization_id)
    to_email = str(payload.to_email or actor.email)
    context = marketing_service.member_context(db, org, actor, extra={"email": to_email})
    subject, html, text, missing = marketing_service.render_marketing_template(template, context)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing template values: {', '.join(missing)}")
    sender = marketing_service.resolve_sender(db, org, payload.sender_lane)
    outbound = OutboundMessage(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=actor.id,
        template_id=template.id,
        email=to_email,
        subject=subject,
        html_body=html,
        text_body=text,
        sender_lane=sender.lane,
        from_email=sender.from_email,
        from_name=sender.from_name,
        source="template_test",
        source_context={"template_public_id": template.public_id},
    )
    db.add(outbound)
    db.commit()
    db.refresh(outbound)
    outbound = marketing_service.dispatch_outbound(db, org, outbound)
    return {"status": outbound.status, "outbound_message_public_id": outbound.public_id}


@router.get("/segments", response_model=list[SegmentOut])
def list_segments(
    organization_public_id: str | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    query = db.query(AudienceSegment).filter(AudienceSegment.organization_id == org.id)
    if not include_archived:
        query = query.filter(AudienceSegment.is_archived.is_(False))
    return [_segment_out(db, segment) for segment in query.order_by(AudienceSegment.updated_at.desc()).all()]


@router.post("/segments", response_model=SegmentOut)
def create_segment(
    payload: SegmentCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    count = len(marketing_service.get_audience_members(db, org, payload.filters))
    segment = AudienceSegment(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        description=payload.description,
        filters=payload.filters,
        preview_count=count,
        last_previewed_at=marketing_service.now_utc(),
        created_by_user_id=actor.id,
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return _segment_out(db, segment)


@router.put("/segments/{segment_public_id}", response_model=SegmentOut)
def update_segment(
    segment_public_id: str,
    payload: SegmentUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    segment = db.query(AudienceSegment).filter(AudienceSegment.public_id == segment_public_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    org = _org_by_id_for_actor(db, actor, segment.organization_id)
    if payload.name is not None:
        segment.name = payload.name
    if payload.description is not None:
        segment.description = payload.description
    if payload.filters is not None:
        segment.filters = payload.filters
        segment.preview_count = len(marketing_service.get_audience_members(db, org, payload.filters))
        segment.last_previewed_at = marketing_service.now_utc()
    if payload.is_archived is not None:
        segment.is_archived = payload.is_archived
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return _segment_out(db, segment)


@router.post("/segments/preview-count", response_model=SegmentPreviewOut)
def preview_segment(
    payload: SegmentPreviewIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    members = marketing_service.get_audience_members(db, org, payload.filters)
    return SegmentPreviewOut(total=len(members), sample=marketing_service.audience_sample(members))


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(
    organization_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    campaigns = (
        db.query(MarketingCampaign)
        .filter(MarketingCampaign.organization_id == org.id)
        .order_by(MarketingCampaign.updated_at.desc())
        .all()
    )
    return [_campaign_out(db, campaign) for campaign in campaigns]


@router.post("/campaigns", response_model=CampaignOut)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    template = (
        db.query(MarketingTemplate)
        .filter(MarketingTemplate.organization_id == org.id, MarketingTemplate.public_id == payload.template_public_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    segment = None
    if payload.segment_public_id:
        segment = (
            db.query(AudienceSegment)
            .filter(AudienceSegment.organization_id == org.id, AudienceSegment.public_id == payload.segment_public_id)
            .first()
        )
        if not segment:
            raise HTTPException(status_code=404, detail="Segment not found")
    sender = marketing_service.resolve_sender(db, org, payload.sender_lane)
    campaign = MarketingCampaign(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        template_id=template.id,
        segment_id=segment.id if segment else None,
        snapshot_filters=payload.filters or (segment.filters if segment else {}),
        sender_lane=sender.lane,
        scheduled_at=payload.scheduled_at,
        created_by_user_id=actor.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_out(db, campaign)


@router.get("/campaigns/{campaign_public_id}", response_model=CampaignOut)
def get_campaign(
    campaign_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.public_id == campaign_public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _org_by_id_for_actor(db, actor, campaign.organization_id)
    return _campaign_out(db, campaign)


@router.get("/campaigns/{campaign_public_id}/recipients", response_model=list[CampaignRecipientOut])
def list_campaign_recipients(
    campaign_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.public_id == campaign_public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _org_by_id_for_actor(db, actor, campaign.organization_id)
    recipients = (
        db.query(CampaignRecipient)
        .filter(CampaignRecipient.campaign_id == campaign.id)
        .order_by(CampaignRecipient.created_at.desc())
        .all()
    )
    return [_recipient_out(db, recipient) for recipient in recipients]


@router.get("/campaigns/{campaign_public_id}/review-breakdown", response_model=CampaignReviewOut)
def get_campaign_review(
    campaign_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.public_id == campaign_public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    org = _org_by_id_for_actor(db, actor, campaign.organization_id)
    return CampaignReviewOut(**marketing_service.campaign_review(db, org, campaign))


@router.post("/campaigns/{campaign_public_id}/send", response_model=CampaignOut)
def send_or_schedule_campaign(
    campaign_public_id: str,
    payload: CampaignSendIn | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.public_id == campaign_public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    org = _org_by_id_for_actor(db, actor, campaign.organization_id)
    campaign = marketing_service.send_campaign(db, org, campaign, scheduled_at=payload.scheduled_at if payload else None)
    return _campaign_out(db, campaign)


@router.post("/campaigns/{campaign_public_id}/cancel", response_model=CampaignOut)
def cancel_campaign(
    campaign_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.public_id == campaign_public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _org_by_id_for_actor(db, actor, campaign.organization_id)
    campaign.status = "canceled"
    campaign.canceled_at = marketing_service.now_utc()
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_out(db, campaign)


@router.get("/suppressions", response_model=list[SuppressionOut])
def list_suppressions(
    organization_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    suppressions = (
        db.query(EmailSuppression)
        .filter(EmailSuppression.organization_id == org.id)
        .order_by(EmailSuppression.updated_at.desc())
        .all()
    )
    return [_suppression_out(db, suppression) for suppression in suppressions]


@router.post("/suppressions", response_model=SuppressionOut)
def create_suppression(
    payload: SuppressionCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    user = db.query(User).filter(User.email == str(payload.email)).first()
    suppression = marketing_service.upsert_suppression(
        db,
        org,
        str(payload.email),
        payload.reason,
        user_id=user.id if user else None,
        source="manual",
        created_by_user_id=actor.id,
    )
    return _suppression_out(db, suppression)


@router.post("/suppressions/{suppression_public_id}/resubscribe", response_model=SuppressionOut)
def resubscribe_suppression(
    suppression_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    suppression = db.query(EmailSuppression).filter(EmailSuppression.public_id == suppression_public_id).first()
    if not suppression:
        raise HTTPException(status_code=404, detail="Suppression not found")
    _org_by_id_for_actor(db, actor, suppression.organization_id)
    suppression.status = "resubscribed"
    suppression.resubscribed_at = marketing_service.now_utc()
    db.add(suppression)
    db.commit()
    db.refresh(suppression)
    return _suppression_out(db, suppression)


@router.get("/settings", response_model=SenderSettingsOut)
def get_sender_settings(
    organization_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    setting = marketing_service.get_or_create_sender_settings(db, org)
    verified = (
        db.query(MarketingVerifiedSender)
        .filter(MarketingVerifiedSender.organization_id == org.id)
        .order_by(MarketingVerifiedSender.created_at.desc())
        .all()
    )
    selected = db.query(MarketingVerifiedSender).filter(MarketingVerifiedSender.id == setting.verified_sender_id).first() if setting.verified_sender_id else None
    return SenderSettingsOut(
        organization_public_id=org.public_id,
        default_sender_lane=setting.default_sender_lane,
        allowed_lanes=marketing_service.allowed_lanes_for_org(org),
        shared_daily_cap=org.shared_daily_cap,
        verified_sender_daily_cap=org.verified_sender_daily_cap,
        shared_from_email=setting.shared_from_email or "",
        shared_from_name=setting.shared_from_name,
        verified_sender_public_id=selected.public_id if selected else None,
        verified_senders=[_verified_sender_out(sender) for sender in verified],
    )


@router.put("/settings/sender", response_model=SenderSettingsOut)
def update_sender_settings(
    payload: SenderSettingUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    setting = marketing_service.get_or_create_sender_settings(db, org)
    if payload.default_sender_lane not in marketing_service.allowed_lanes_for_org(org):
        raise HTTPException(status_code=400, detail="Sender lane is not allowed")
    setting.default_sender_lane = payload.default_sender_lane
    setting.updated_by_user_id = actor.id
    if payload.verified_sender_public_id:
        sender = (
            db.query(MarketingVerifiedSender)
            .filter(MarketingVerifiedSender.organization_id == org.id, MarketingVerifiedSender.public_id == payload.verified_sender_public_id)
            .first()
        )
        if not sender:
            raise HTTPException(status_code=404, detail="Verified sender not found")
        setting.verified_sender_id = sender.id
    elif payload.default_sender_lane == "shared":
        setting.verified_sender_id = None
    db.add(setting)
    db.commit()
    return get_sender_settings(org.public_id, db, token)


@router.post("/settings/verified-senders", response_model=VerifiedSenderOut)
def create_verified_sender(
    payload: VerifiedSenderCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    sender = MarketingVerifiedSender(
        organization_id=org.id,
        tenant_id=org.id,
        email=str(payload.email).lower(),
        name=payload.name,
        status="pending",
        created_by_user_id=actor.id,
    )
    db.add(sender)
    db.commit()
    db.refresh(sender)
    return _verified_sender_out(sender)


@router.post("/settings/verified-senders/{sender_public_id}/refresh", response_model=VerifiedSenderOut)
def refresh_verified_sender(
    sender_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    sender = db.query(MarketingVerifiedSender).filter(MarketingVerifiedSender.public_id == sender_public_id).first()
    if not sender:
        raise HTTPException(status_code=404, detail="Verified sender not found")
    _org_by_id_for_actor(db, actor, sender.organization_id)
    return _verified_sender_out(marketing_service.refresh_verified_sender(db, sender))


@router.get("/workflows", response_model=list[WorkflowOut])
def list_workflows(
    organization_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, organization_public_id)
    workflows = db.query(Workflow).filter(Workflow.organization_id == org.id).order_by(Workflow.updated_at.desc()).all()
    return [_workflow_out(db, workflow) for workflow in workflows]


@router.post("/workflows", response_model=WorkflowOut)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    org = _org_for_actor(db, actor, payload.organization_public_id)
    workflow = Workflow(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        graph=payload.graph or marketing_service.make_default_workflow_graph(),
        created_by_user_id=actor.id,
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return _workflow_out(db, workflow)


@router.get("/workflows/{workflow_public_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    return _workflow_out(db, workflow)


@router.put("/workflows/{workflow_public_id}", response_model=WorkflowOut)
def update_workflow(
    workflow_public_id: str,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    if payload.name is not None:
        workflow.name = payload.name
    if payload.graph is not None:
        workflow.graph = payload.graph
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return _workflow_out(db, workflow)


@router.get("/workflows/{workflow_public_id}/versions", response_model=list[WorkflowVersionOut])
def list_workflow_versions(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    versions = db.query(WorkflowVersion).filter(WorkflowVersion.workflow_id == workflow.id).order_by(WorkflowVersion.version_number.desc()).all()
    return [
        WorkflowVersionOut(
            public_id=version.public_id,
            version_number=version.version_number,
            graph=version.graph or {},
            status=version.status,
            published_at=version.published_at,
        )
        for version in versions
    ]


@router.post("/workflows/{workflow_public_id}/publish", response_model=WorkflowVersionOut)
def publish_workflow(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    version = marketing_service.publish_workflow(db, workflow, actor.id)
    return WorkflowVersionOut(
        public_id=version.public_id,
        version_number=version.version_number,
        graph=version.graph or {},
        status=version.status,
        published_at=version.published_at,
    )


@router.post("/workflows/{workflow_public_id}/activate", response_model=WorkflowOut)
def activate_workflow(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    org = _org_by_id_for_actor(db, actor, workflow.organization_id)
    workflow = marketing_service.activate_workflow(db, org, workflow)
    return _workflow_out(db, workflow)


@router.post("/workflows/{workflow_public_id}/pause", response_model=WorkflowOut)
def pause_workflow(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    workflow.status = "paused"
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return _workflow_out(db, workflow)


@router.get("/workflows/{workflow_public_id}/runs", response_model=list[WorkflowRunOut])
def list_workflow_runs(
    workflow_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = _actor(db, token)
    workflow = db.query(Workflow).filter(Workflow.public_id == workflow_public_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    _org_by_id_for_actor(db, actor, workflow.organization_id)
    runs = db.query(WorkflowRun).filter(WorkflowRun.workflow_id == workflow.id).order_by(WorkflowRun.created_at.desc()).all()
    out = []
    for run in runs:
        user = db.query(User).filter(User.id == run.user_id).first()
        out.append(
            WorkflowRunOut(
                public_id=run.public_id,
                workflow_public_id=workflow.public_id,
                user_public_id=user.public_id if user else "",
                status=run.status,
                current_node_id=run.current_node_id,
                next_run_at=run.next_run_at,
                started_at=run.started_at,
                finished_at=run.finished_at,
                created_at=run.created_at,
            )
        )
    return out


@router.post("/webhooks/sendgrid")
async def sendgrid_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.body()
    marketing_service.verify_sendgrid_webhook_signature(
        body,
        request.headers.get("x-twilio-email-event-webhook-signature"),
        request.headers.get("x-twilio-email-event-webhook-timestamp"),
    )
    payload: Any = json.loads(body)
    return marketing_service.process_sendgrid_events(db, payload)


@router.get("/unsubscribe/{token}", response_class=HTMLResponse)
def unsubscribe(token: str, db: Session = Depends(get_db)):
    payload = marketing_service.read_link_token(token)
    org_public_id = payload.get("org")
    email = payload.get("email")
    org = db.query(Organization).filter(Organization.public_id == org_public_id).first()
    if not org or not email:
        raise HTTPException(status_code=404, detail="Unsubscribe link not found")
    user = db.query(User).filter(User.email == email).first()
    marketing_service.upsert_suppression(db, org, str(email), "unsubscribe", user_id=user.id if user else None, source="link")
    return HTMLResponse("<html><body><h1>Unsubscribed</h1><p>You will no longer receive marketing emails from this business.</p></body></html>")


@router.get("/messages/{token}/view", response_class=HTMLResponse)
def view_message(token: str, db: Session = Depends(get_db)):
    payload = marketing_service.read_link_token(token)
    message_public_id = payload.get("message")
    message = db.query(OutboundMessage).filter(OutboundMessage.public_id == message_public_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    body = message.html_body or f"<pre>{message.text_body or ''}</pre>"
    return HTMLResponse(f"<html><head><title>{message.subject}</title></head><body>{body}</body></html>")
