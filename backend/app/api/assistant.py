from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.api.booking_requests import (
    approve_booking_request,
    cancel_booking_request,
    create_booking_request,
    reject_booking_request,
    retry_booking_request_payment,
)
from app.assistant.context import AssistantContext, require_conversation_access, resolve_assistant_context
from app.assistant.runtime import (
    create_space_alert_from_context,
    create_support_ticket,
    disabled_chat_response,
    enforce_rate_limit,
    process_chat,
    quality_metrics,
    serialize_message,
)
from app.core.auth import get_current_user, get_optional_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.assistant import AssistantConversation, AssistantFeedback, AssistantMessage, OwnerPolicyKB
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.schemas.assistant import (
    AssistantChatIn,
    AssistantEscalationIn,
    AssistantFeedbackIn,
    AssistantProposalActionIn,
    AssistantProposalActionOut,
    AssistantQualityOut,
    OwnerPolicyKBIn,
    OwnerPolicyKBOut,
    OwnerPolicyKBUpdateIn,
    SupportTicketOut,
)
from app.schemas.booking_request import BookingRequestCreate, BookingRequestDecision, BookingRequestRetryPayment
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_owner_or_admin
from app.services.platform_auth import require_platform_roles
from app.models.enums import PlatformTeamRole

router = APIRouter()

READ_PLATFORM_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}


def _client_host(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _ctx(db: Session, request: Request, token: dict | None, guest_id: str | None) -> AssistantContext:
    return resolve_assistant_context(db, token=token, guest_id=guest_id, client_host=_client_host(request))


@router.get("/assistant/status")
def assistant_status() -> dict[str, Any]:
    return {
        "enabled": settings.ASSISTANT_ENABLED,
        "primary_model": settings.ASSISTANT_PRIMARY_MODEL,
        "summary_model": settings.ASSISTANT_SUMMARY_MODEL,
    }


@router.post("/assistant/chat")
def assistant_chat(
    payload: AssistantChatIn,
    request: Request,
    stream: bool = Query(True),
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    if not settings.ASSISTANT_ENABLED:
        data = disabled_chat_response()
        if stream:
            return _sse_response(data)
        return data

    guest_id = payload.guest_id or request.cookies.get("ps_assistant_guest") or f"guest_{id(payload)}"
    ctx = _ctx(db, request, token, guest_id)
    try:
        enforce_rate_limit(db, ctx)
    except HTTPException as exc:
        data = {
            "enabled": True,
            "disabled_reason": exc.detail,
            "conversation_public_id": payload.conversation_public_id,
            "guest_id": guest_id,
            "message": None,
            "rate_limited": True,
            "cost_capped": False,
        }
        if stream:
            return _sse_response(data)
        return JSONResponse(status_code=429, content=data)

    data = process_chat(
        db,
        ctx=ctx,
        conversation_public_id=payload.conversation_public_id,
        guest_id=guest_id,
        message=payload.message,
        page_context=payload.page_context,
    )
    if stream:
        return _sse_response(data)
    return data


def _sse_response(data: dict[str, Any]) -> StreamingResponse:
    def events():
        yield f"event: message\ndata: {json.dumps(data)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


def _query_for_context(db: Session, ctx: AssistantContext):
    query = db.query(AssistantConversation).filter(AssistantConversation.deleted_at.is_(None))
    if ctx.audience == "platform_admin":
        return query
    if ctx.user_id:
        return query.filter(AssistantConversation.user_id == ctx.user_id)
    if ctx.guest_id:
        return query.filter(AssistantConversation.guest_id == ctx.guest_id)
    return query.filter(False)


@router.get("/assistant/conversations")
def list_assistant_conversations(
    request: Request,
    guest_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, guest_id)
    rows = _query_for_context(db, ctx).order_by(AssistantConversation.last_message_at.desc()).limit(50).all()
    return [
        {
            "public_id": row.public_id,
            "audience": row.audience,
            "title": row.title,
            "summary": row.summary,
            "escalation_state": row.escalation_state,
            "last_message_at": row.last_message_at,
            "messages": [],
        }
        for row in rows
    ]


@router.get("/assistant/conversations/{public_id}")
def get_assistant_conversation(
    public_id: str,
    request: Request,
    guest_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, guest_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.public_id == public_id, AssistantConversation.deleted_at.is_(None)).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_conversation_access(conversation, ctx)
    messages = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conversation.id)
        .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
        .all()
    )
    return {
        "public_id": conversation.public_id,
        "audience": conversation.audience,
        "title": conversation.title,
        "summary": conversation.summary,
        "escalation_state": conversation.escalation_state,
        "last_message_at": conversation.last_message_at,
        "messages": [serialize_message(message).model_dump(mode="json") for message in messages],
    }


@router.delete("/assistant/conversations/{public_id}")
def delete_assistant_conversation(
    public_id: str,
    request: Request,
    guest_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, guest_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.public_id == public_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_conversation_access(conversation, ctx)
    conversation.deleted_at = datetime.now(timezone.utc)
    db.add(conversation)
    db.commit()
    return {"status": "deleted"}


@router.get("/assistant/conversations/{public_id}/export")
def export_assistant_conversation(
    public_id: str,
    request: Request,
    guest_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    return get_assistant_conversation(public_id, request, guest_id, db, token)


@router.post("/assistant/conversations/{public_id}/feedback")
def create_assistant_feedback(
    public_id: str,
    payload: AssistantFeedbackIn,
    request: Request,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, payload.guest_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.public_id == public_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_conversation_access(conversation, ctx)
    message = None
    if payload.message_public_id:
        message = db.query(AssistantMessage).filter(AssistantMessage.public_id == payload.message_public_id, AssistantMessage.conversation_id == conversation.id).first()
    feedback = AssistantFeedback(
        conversation_id=conversation.id,
        message_id=message.id if message else None,
        user_id=ctx.user_id,
        guest_id=ctx.guest_id,
        rating=payload.rating,
        reason=payload.reason,
    )
    db.add(feedback)
    db.commit()
    return {"status": "recorded", "public_id": feedback.public_id}


def _find_proposal(db: Session, proposal_id: str) -> tuple[AssistantMessage, dict[str, Any]]:
    messages = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.proposals.isnot(None))
        .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
        .limit(200)
        .all()
    )
    for message in messages:
        for proposal in message.proposals or []:
            if proposal.get("proposal_id") == proposal_id:
                return message, proposal
    raise HTTPException(status_code=404, detail="Proposal not found")


def _proposal_expired(proposal: dict[str, Any]) -> bool:
    raw = str(proposal.get("expires_at"))
    expires = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return expires < datetime.now(timezone.utc)


def _serialize_result(result: Any) -> dict[str, Any]:
    if hasattr(result, "model_dump"):
        return result.model_dump(mode="json")
    if isinstance(result, dict):
        return result
    return {"value": str(result)}


def _mark_proposal(message: AssistantMessage, proposal_id: str, status: str) -> None:
    proposals = []
    for proposal in message.proposals or []:
        next_proposal = dict(proposal)
        if next_proposal.get("proposal_id") == proposal_id:
            next_proposal["status"] = status
        proposals.append(next_proposal)
    message.proposals = proposals


@router.post("/assistant/proposals/{proposal_id}/confirm", response_model=AssistantProposalActionOut)
def confirm_assistant_proposal(
    proposal_id: str,
    payload: AssistantProposalActionIn,
    request: Request,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    message, proposal = _find_proposal(db, proposal_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.id == message.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ctx = _ctx(db, request, token, payload.guest_id)
    require_conversation_access(conversation, ctx)
    if proposal.get("status") not in {None, "pending"}:
        raise HTTPException(status_code=400, detail="Proposal already handled")
    if _proposal_expired(proposal):
        _mark_proposal(message, proposal_id, "expired")
        db.add(message)
        db.commit()
        raise HTTPException(status_code=400, detail="Proposal expired")

    endpoint = proposal.get("endpoint") or {}
    path = endpoint.get("path")
    body = proposal.get("payload") or {}
    if path == "/api/booking-requests":
        if token is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        result = create_booking_request(BookingRequestCreate(**body), db=db, token=token)
    elif path and path.endswith("/cancel") and path.startswith("/api/booking-requests/"):
        if token is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        public_id = path.split("/")[3]
        result = cancel_booking_request(public_id, db=db, token=token)
    elif path and path.endswith("/approve") and path.startswith("/api/booking-requests/"):
        if token is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        public_id = path.split("/")[3]
        result = approve_booking_request(public_id, BookingRequestDecision(**body), db=db, token=token)
    elif path and path.endswith("/reject") and path.startswith("/api/booking-requests/"):
        if token is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        public_id = path.split("/")[3]
        result = reject_booking_request(public_id, BookingRequestDecision(**body), db=db, token=token)
    elif path and path.endswith("/retry-payment") and path.startswith("/api/booking-requests/"):
        if token is None:
            raise HTTPException(status_code=401, detail="Sign in required")
        public_id = path.split("/")[3]
        result = retry_booking_request_payment(public_id, BookingRequestRetryPayment(**body), db=db, token=token)
    elif proposal.get("kind") == "support.escalate":
        result = create_support_ticket(db, conversation=conversation, ctx=ctx, subject=body.get("subject") or "Assistant escalation")
    else:
        raise HTTPException(status_code=400, detail="Unsupported proposal action")

    _mark_proposal(message, proposal_id, "confirmed")
    db.add(message)
    db.commit()
    return AssistantProposalActionOut(proposal_id=proposal_id, status="confirmed", result=_serialize_result(result))


@router.post("/assistant/proposals/{proposal_id}/dismiss", response_model=AssistantProposalActionOut)
def dismiss_assistant_proposal(
    proposal_id: str,
    payload: AssistantProposalActionIn,
    request: Request,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    message, _proposal = _find_proposal(db, proposal_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.id == message.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    ctx = _ctx(db, request, token, payload.guest_id)
    require_conversation_access(conversation, ctx)
    _mark_proposal(message, proposal_id, "dismissed")
    db.add(message)
    db.commit()
    return AssistantProposalActionOut(proposal_id=proposal_id, status="dismissed", result=None)


@router.post("/assistant/conversations/{public_id}/escalate", response_model=SupportTicketOut)
def escalate_assistant_conversation(
    public_id: str,
    payload: AssistantEscalationIn,
    request: Request,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, payload.guest_id)
    conversation = db.query(AssistantConversation).filter(AssistantConversation.public_id == public_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    require_conversation_access(conversation, ctx)
    return create_support_ticket(
        db,
        conversation=conversation,
        ctx=ctx,
        subject=payload.subject or "Assistant escalation",
        requester_email=payload.requester_email,
    )


def _policy_out(db: Session, item: OwnerPolicyKB) -> OwnerPolicyKBOut:
    if item.space_id:
        space = db.query(Space).filter(Space.id == item.space_id).first()
        return OwnerPolicyKBOut(
            public_id=item.public_id,
            scope_type="space",
            scope_public_id=space.public_id if space else "",
            category=item.category,
            title=item.title,
            body=item.body,
            source_url=item.source_url,
            is_active=item.is_active,
            updated_at=item.updated_at,
        )
    if item.location_id:
        location = db.query(Location).filter(Location.id == item.location_id).first()
        return OwnerPolicyKBOut(
            public_id=item.public_id,
            scope_type="location",
            scope_public_id=location.public_id if location else "",
            category=item.category,
            title=item.title,
            body=item.body,
            source_url=item.source_url,
            is_active=item.is_active,
            updated_at=item.updated_at,
        )
    org = db.query(Organization).filter(Organization.id == item.organization_id).first()
    return OwnerPolicyKBOut(
        public_id=item.public_id,
        scope_type="organization",
        scope_public_id=org.public_id if org else "",
        category=item.category,
        title=item.title,
        body=item.body,
        source_url=item.source_url,
        is_active=item.is_active,
        updated_at=item.updated_at,
    )


def _resolve_policy_scope(db: Session, token: dict, payload: OwnerPolicyKBIn) -> tuple[Organization, Location | None, Space | None]:
    user = get_or_create_user(db, token)
    if payload.scope_type == "organization":
        org = db.query(Organization).filter(Organization.public_id == payload.scope_public_id).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        member = get_org_member(db, org.id, user.id)
        require_owner_or_admin(member)
        return org, None, None
    if payload.scope_type == "location":
        location = db.query(Location).filter(Location.public_id == payload.scope_public_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Location not found")
        org = db.query(Organization).filter(Organization.id == location.organization_id).first()
        member = get_org_member(db, location.organization_id, user.id)
        require_owner_or_admin(member)
        return org, location, None
    if payload.scope_type == "space":
        space = db.query(Space).filter(Space.public_id == payload.scope_public_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        location = db.query(Location).filter(Location.id == space.location_id).first()
        org = db.query(Organization).filter(Organization.id == space.tenant_id).first()
        member = get_org_member(db, space.tenant_id, user.id)
        require_owner_or_admin(member)
        return org, location, space
    raise HTTPException(status_code=400, detail="Invalid scope_type")


@router.get("/assistant/policies", response_model=list[OwnerPolicyKBOut])
def list_assistant_policies(
    request: Request,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    ctx = _ctx(db, request, token, None)
    if ctx.audience == "platform_admin":
        rows = db.query(OwnerPolicyKB).order_by(OwnerPolicyKB.updated_at.desc()).limit(200).all()
    elif ctx.organization_ids:
        rows = db.query(OwnerPolicyKB).filter(OwnerPolicyKB.organization_id.in_(ctx.organization_ids)).order_by(OwnerPolicyKB.updated_at.desc()).all()
    else:
        raise HTTPException(status_code=403, detail="Owner access required")
    return [_policy_out(db, row) for row in rows]


@router.post("/assistant/policies", response_model=OwnerPolicyKBOut)
def create_assistant_policy(
    payload: OwnerPolicyKBIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org, location, space = _resolve_policy_scope(db, token, payload)
    item = OwnerPolicyKB(
        tenant_id=org.id,
        organization_id=org.id,
        location_id=location.id if location else None,
        space_id=space.id if space else None,
        category=payload.category,
        title=payload.title,
        body=payload.body,
        source_url=payload.source_url,
        is_active=True,
        updated_by_user_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _policy_out(db, item)


@router.patch("/assistant/policies/{public_id}", response_model=OwnerPolicyKBOut)
def update_assistant_policy(
    public_id: str,
    payload: OwnerPolicyKBUpdateIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    item = db.query(OwnerPolicyKB).filter(OwnerPolicyKB.public_id == public_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Policy not found")
    member = get_org_member(db, item.organization_id, user.id)
    require_owner_or_admin(member)
    for field in ("category", "title", "body", "source_url", "is_active"):
        value = getattr(payload, field)
        if value is not None:
            setattr(item, field, value)
    item.updated_by_user_id = user.id
    db.add(item)
    db.commit()
    db.refresh(item)
    return _policy_out(db, item)


@router.delete("/assistant/policies/{public_id}")
def delete_assistant_policy(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    item = db.query(OwnerPolicyKB).filter(OwnerPolicyKB.public_id == public_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Policy not found")
    member = get_org_member(db, item.organization_id, user.id)
    require_owner_or_admin(member)
    item.is_active = False
    item.updated_by_user_id = user.id
    db.add(item)
    db.commit()
    return {"status": "deleted"}


@router.post("/assistant/space-alerts")
def create_assistant_space_alert(
    payload: dict[str, Any],
    request: Request,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    ctx = _ctx(db, request, token, payload.get("guest_id"))
    alert = create_space_alert_from_context(db, ctx=ctx, filters=payload.get("filters") or {})
    return {"public_id": alert.public_id, "status": alert.status}


@router.get("/admin/assistant-quality", response_model=AssistantQualityOut)
def get_assistant_quality(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_PLATFORM_ROLES)
    return quality_metrics(db)
