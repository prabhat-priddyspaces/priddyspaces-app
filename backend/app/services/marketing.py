from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

import httpx
from fastapi import HTTPException
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.serialization import load_der_public_key, load_pem_public_key
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_event import EmailEvent
from app.models.enums import UserRole
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.marketing import (
    AudienceSegment,
    BusinessMarketingSenderSetting,
    CampaignRecipient,
    EmailSuppression,
    MarketingCampaign,
    MarketingTemplate,
    MarketingVerifiedSender,
    OutboundMessage,
    Workflow,
    WorkflowRun,
    WorkflowRunEvent,
    WorkflowVersion,
)
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.subscription import Subscription
from app.models.user import User
from app.services.authz import list_org_members
from app.services.notifications import send_email
from app.services.org_member_stats import MemberStats, compute_member_stats, interacted_user_ids
from app.services.template_rendering import (
    ensure_template_allowed as ensure_template_allowed,  # re-exported for app.api.marketing
    render_template_sources,
)
from app.utils.uuid import new_public_id

logger = logging.getLogger("marketing")

OWNER_MARKETING_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
SENDER_LANES = {"shared", "verified_sender"}

@dataclass
class AudienceMember:
    user: User
    record: OrgMemberProfile | None
    stats: MemberStats
    tags: list[str]


@dataclass
class SenderResolution:
    lane: str
    from_email: str
    from_name: str | None
    daily_cap: int
    verified_sender: MarketingVerifiedSender | None = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def utc_or_none(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def accessible_marketing_orgs(db: Session, user_id: int) -> list[Organization]:
    members = list_org_members(db, user_id, OWNER_MARKETING_ROLES)
    org_ids = sorted({member.organization_id for member in members})
    if not org_ids:
        return []
    return db.query(Organization).filter(Organization.id.in_(org_ids)).all()


def resolve_marketing_org(
    db: Session,
    user_id: int,
    organization_public_id: str | None,
) -> Organization:
    orgs = accessible_marketing_orgs(db, user_id)
    if not orgs:
        raise HTTPException(status_code=403, detail="No marketing organization access")
    if organization_public_id:
        for org in orgs:
            if org.public_id == organization_public_id:
                return org
        raise HTTPException(status_code=404, detail="Organization not found")
    if len(orgs) > 1:
        raise HTTPException(status_code=400, detail="organization_public_id required")
    return orgs[0]


def render_marketing_template(
    template: MarketingTemplate,
    context: dict[str, Any],
) -> tuple[str, str | None, str | None, list[str]]:
    return render_template_sources(
        subject=template.subject,
        html_body=template.html_body,
        text_body=template.text_body,
        context=context,
    )


def get_or_create_sender_settings(db: Session, org: Organization) -> BusinessMarketingSenderSetting:
    setting = (
        db.query(BusinessMarketingSenderSetting)
        .filter(BusinessMarketingSenderSetting.organization_id == org.id)
        .first()
    )
    if setting:
        return setting
    setting = BusinessMarketingSenderSetting(
        organization_id=org.id,
        tenant_id=org.id,
        default_sender_lane=org.default_marketing_lane or "shared",
        shared_from_email=settings.SENDGRID_MARKETING_FROM_EMAIL,
        shared_from_name=settings.SENDGRID_MARKETING_FROM_NAME,
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def allowed_lanes_for_org(org: Organization) -> list[str]:
    raw = org.allowed_marketing_lanes or "shared,verified_sender"
    lanes = [lane.strip() for lane in raw.split(",") if lane.strip()]
    return [lane for lane in lanes if lane in SENDER_LANES] or ["shared"]


def resolve_sender(db: Session, org: Organization, requested_lane: str | None) -> SenderResolution:
    setting = get_or_create_sender_settings(db, org)
    lane = requested_lane or setting.default_sender_lane or org.default_marketing_lane or "shared"
    if lane not in allowed_lanes_for_org(org):
        raise HTTPException(status_code=400, detail="Sender lane is not allowed for this organization")
    if lane == "shared":
        return SenderResolution(
            lane="shared",
            from_email=setting.shared_from_email or settings.SENDGRID_MARKETING_FROM_EMAIL,
            from_name=setting.shared_from_name or settings.SENDGRID_MARKETING_FROM_NAME,
            daily_cap=org.shared_daily_cap if org.shared_daily_cap is not None else 500,
        )
    if not org.allow_business_sender_overrides:
        raise HTTPException(status_code=400, detail="Verified business sender overrides are disabled")
    if not setting.verified_sender_id:
        raise HTTPException(status_code=400, detail="No verified sender selected")
    sender = (
        db.query(MarketingVerifiedSender)
        .filter(
            MarketingVerifiedSender.id == setting.verified_sender_id,
            MarketingVerifiedSender.organization_id == org.id,
        )
        .first()
    )
    if not sender or sender.status != "verified":
        raise HTTPException(status_code=400, detail="Verified sender is not ready")
    return SenderResolution(
        lane="verified_sender",
        from_email=sender.email,
        from_name=sender.name,
        daily_cap=org.verified_sender_daily_cap if org.verified_sender_daily_cap is not None else 2000,
        verified_sender=sender,
    )


def decode_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
        if isinstance(decoded, list):
            return [str(item).strip() for item in decoded if str(item).strip()]
    except (TypeError, json.JSONDecodeError):
        pass
    return [part.strip() for part in raw.split(",") if part.strip()]


def encode_tags(tags: Iterable[str]) -> str | None:
    cleaned = sorted({str(tag).strip() for tag in tags if str(tag).strip()})
    return json.dumps(cleaned) if cleaned else None


def get_audience_members(db: Session, org: Organization, filters: dict[str, Any] | None = None) -> list[AudienceMember]:
    interacted = interacted_user_ids(db, org.id)
    records = {
        record.user_id: record
        for record in db.query(OrgMemberProfile).filter(OrgMemberProfile.organization_id == org.id).all()
    }
    user_ids = interacted | set(records.keys())
    if not user_ids:
        return []
    users = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()}

    members: list[AudienceMember] = []
    for user_id in sorted(user_ids):
        user = users.get(user_id)
        if not user:
            continue
        record = records.get(user_id)
        stats = compute_member_stats(db, org.id, user_id)
        member = AudienceMember(user=user, record=record, stats=stats, tags=decode_tags(record.tags if record else None))
        if _member_matches_filters(member, filters or {}):
            members.append(member)
    return members


def _member_matches_filters(member: AudienceMember, filters: dict[str, Any]) -> bool:
    user = member.user
    record = member.record
    stats = member.stats

    status = filters.get("status")
    record_status = record.status if record else "active"
    if status:
        statuses = status if isinstance(status, list) else [status]
        if record_status not in {str(item) for item in statuses}:
            return False

    search = str(filters.get("search") or "").strip().lower()
    if search:
        haystack = " ".join(
            [
                user.full_name or "",
                user.first_name or "",
                user.last_name or "",
                user.email or "",
                record.company_name if record else "",
            ]
        ).lower()
        if search not in haystack:
            return False

    requested_tags = filters.get("tags") or []
    if isinstance(requested_tags, str):
        requested_tags = [requested_tags]
    requested_tags = {str(tag).strip().lower() for tag in requested_tags if str(tag).strip()}
    if requested_tags:
        member_tags = {tag.lower() for tag in member.tags}
        mode = filters.get("tag_mode", "any")
        if mode == "all":
            if not requested_tags.issubset(member_tags):
                return False
        elif not (requested_tags & member_tags):
            return False

    active_subscription = filters.get("active_subscription")
    if active_subscription is not None and bool(active_subscription) != (stats.active_subscriptions > 0):
        return False

    min_bookings = filters.get("min_booking_count")
    if min_bookings is not None and stats.total_bookings < int(min_bookings):
        return False

    max_bookings = filters.get("max_booking_count")
    if max_bookings is not None and stats.total_bookings > int(max_bookings):
        return False

    min_revenue = filters.get("min_lifetime_revenue_cents")
    if min_revenue is not None and stats.total_revenue_cents < int(min_revenue):
        return False

    after = _parse_date(filters.get("last_booking_after"))
    if after and (not stats.last_booking_at or stats.last_booking_at.date() < after):
        return False

    before = _parse_date(filters.get("last_booking_before"))
    if before and (not stats.last_booking_at or stats.last_booking_at.date() > before):
        return False

    return True


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date filter: {value}")


def audience_sample(members: list[AudienceMember], limit: int = 10) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for member in members[:limit]:
        user = member.user
        out.append(
            {
                "user_public_id": user.public_id,
                "name": user.full_name or user.first_name or user.email,
                "email": user.email,
                "status": member.record.status if member.record else "active",
                "tags": member.tags,
                "total_bookings": member.stats.total_bookings,
                "active_subscriptions": member.stats.active_subscriptions,
            }
        )
    return out


def is_suppressed(db: Session, org: Organization, email: str) -> EmailSuppression | None:
    return (
        db.query(EmailSuppression)
        .filter(
            EmailSuppression.organization_id == org.id,
            func.lower(EmailSuppression.email) == email.lower(),
            EmailSuppression.status == "active",
        )
        .first()
    )


def upsert_suppression(
    db: Session,
    org: Organization,
    email: str,
    reason: str,
    *,
    user_id: int | None = None,
    source: str = "manual",
    source_event_id: str | None = None,
    created_by_user_id: int | None = None,
) -> EmailSuppression:
    suppression = (
        db.query(EmailSuppression)
        .filter(EmailSuppression.organization_id == org.id, func.lower(EmailSuppression.email) == email.lower())
        .first()
    )
    if suppression:
        suppression.reason = reason
        suppression.status = "active"
        suppression.source = source
        suppression.source_event_id = source_event_id
        suppression.resubscribed_at = None
        if user_id:
            suppression.user_id = user_id
    else:
        suppression = EmailSuppression(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=user_id,
            email=email.lower(),
            reason=reason,
            status="active",
            source=source,
            source_event_id=source_event_id,
            created_by_user_id=created_by_user_id,
        )
    db.add(suppression)
    db.commit()
    db.refresh(suppression)
    return suppression


def member_context(
    db: Session,
    org: Organization,
    user: User | None,
    *,
    outbound: OutboundMessage | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    record = None
    if user:
        record = (
            db.query(OrgMemberProfile)
            .filter(OrgMemberProfile.organization_id == org.id, OrgMemberProfile.user_id == user.id)
            .first()
        )
    member_phone = record.phone if record and record.phone else (user.phone if user else None)
    member = {
        "first_name": user.first_name if user else "",
        "last_name": user.last_name if user else "",
        "full_name": (user.full_name or f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email) if user else "",
        "email": user.email if user else "",
        "phone": member_phone or "",
        "company": record.company_name if record and record.company_name else "",
    }
    owner = db.query(User).filter(User.id == org.owner_id).first()
    owner_first = owner.first_name if owner else ""
    owner_last = owner.last_name if owner else ""
    owner_full = (owner.full_name or f"{owner_first or ''} {owner_last or ''}".strip() or owner.email) if owner else ""

    latest_subscription = None
    if user:
        latest_subscription = (
            db.query(Subscription)
            .filter(Subscription.tenant_id == org.id, Subscription.user_id == user.id)
            .order_by(Subscription.created_at.desc())
            .first()
        )
    latest_invoice = None
    if user:
        latest_invoice = (
            db.query(Invoice)
            .filter(Invoice.tenant_id == org.id, Invoice.user_id == user.id)
            .order_by(Invoice.created_at.desc())
            .first()
        )
    location = db.query(Location).filter(Location.organization_id == org.id).order_by(Location.id.asc()).first()

    email = user.email if user else (extra or {}).get("email", "")
    links = {
        "unsubscribe": f"{settings.BACKEND_URL}/api/marketing/unsubscribe/{make_link_token({'org': org.public_id, 'email': email})}",
        "view_in_browser": "#",
        "booking": "",
        "invoice": latest_invoice.pdf_url if latest_invoice and latest_invoice.pdf_url else "",
        "retry_payment": "",
        "update_payment_method": f"{settings.FRONTEND_URL.rstrip('/')}/member/payments",
        "access_pass": "",
    }
    if outbound:
        links["view_in_browser"] = f"{settings.BACKEND_URL}/api/marketing/messages/{make_link_token({'message': outbound.public_id})}/view"

    context = {
        "member": member,
        "booking": {
            "number": "",
            "request_number": "",
            "start_date": "",
            "end_date": "",
            "start_time": "",
            "end_time": "",
            "space_name": "",
            "location_name": location.name if location else "",
            "link": "",
            "access_pass_link": "",
        },
        "space": {
            "name": "",
            "type": "",
            "capacity": "",
            "location_name": location.name if location else "",
        },
        "membership": {
            "name": "",
            "status": latest_subscription.status if latest_subscription else "",
            "renewal_date": "",
            "expiry_date": latest_subscription.end_date.isoformat() if latest_subscription and latest_subscription.end_date else "",
        },
        "invoice": {
            "number": latest_invoice.public_id if latest_invoice else "",
            "amount": latest_invoice.amount if latest_invoice else "",
            "balance_due": latest_invoice.amount if latest_invoice and latest_invoice.status != "paid" else 0,
            "due_date": "",
            "link": latest_invoice.pdf_url if latest_invoice else "",
            "status": latest_invoice.status if latest_invoice else "",
        },
        "business": {
            "name": org.name,
            "support_email": location.public_email if location and location.public_email else settings.SENDGRID_FROM_EMAIL,
            "phone": location.public_phone if location and location.public_phone else "",
            "address": location.address if location else "",
            "city": location.city if location and location.city else "",
            "state": location.state if location and location.state else "",
            "postal_code": location.postal_code if location and location.postal_code else "",
            "website": org.website or "",
        },
        "owner": {
            "first_name": owner_first,
            "last_name": owner_last,
            "full_name": owner_full,
            "email": owner.email if owner else "",
            "phone": owner.phone if owner and owner.phone else "",
        },
        "location": {
            "name": location.name if location else "",
            "address": location.address if location else "",
            "city": location.city if location and location.city else "",
            "state": location.state if location and location.state else "",
            "postal_code": location.postal_code if location and location.postal_code else "",
            "phone": location.public_phone if location and location.public_phone else "",
            "email": location.public_email if location and location.public_email else settings.SENDGRID_FROM_EMAIL,
            "timezone": location.timezone if location else "",
        },
        "payment": {
            "amount": latest_invoice.amount if latest_invoice else "",
            "status": "",
            "failure_reason": "The payment processor declined the charge.",
            "provider": "",
        },
        "card": {
            "brand": "",
            "last4": "",
            "exp_month": "",
            "exp_year": "",
            "expiry": "",
        },
        "links": links,
    }
    if extra:
        context.update(extra)
    return context


def make_link_token(payload: dict[str, Any]) -> str:
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    encoded = base64.urlsafe_b64encode(body).decode().rstrip("=")
    secret = (settings.MARKETING_LINK_SECRET or settings.JWT_SECRET or "dev-marketing-link-secret").encode()
    sig = hmac.new(secret, encoded.encode(), hashlib.sha256).digest()
    encoded_sig = base64.urlsafe_b64encode(sig).decode().rstrip("=")
    return f"{encoded}.{encoded_sig}"


def read_link_token(token: str) -> dict[str, Any]:
    try:
        encoded, encoded_sig = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid token") from exc
    secret = (settings.MARKETING_LINK_SECRET or settings.JWT_SECRET or "dev-marketing-link-secret").encode()
    expected = base64.urlsafe_b64encode(hmac.new(secret, encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    if not hmac.compare_digest(expected, encoded_sig):
        raise HTTPException(status_code=400, detail="Invalid token")
    padded = encoded + "=" * (-len(encoded) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid token") from exc


def campaign_filters(db: Session, campaign: MarketingCampaign) -> dict[str, Any]:
    if campaign.segment_id:
        segment = db.query(AudienceSegment).filter(AudienceSegment.id == campaign.segment_id).first()
        if segment:
            return segment.filters or {}
    return campaign.snapshot_filters or {}


def campaign_review(db: Session, org: Organization, campaign: MarketingCampaign) -> dict[str, int]:
    members = get_audience_members(db, org, campaign_filters(db, campaign))
    total = len(members)
    no_email = 0
    suppressed = 0
    eligible = 0
    for member in members:
        email = (member.user.email or "").strip()
        if not email:
            no_email += 1
            continue
        if is_suppressed(db, org, email):
            suppressed += 1
            continue
        eligible += 1
    snapshotted = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == campaign.id).count()
    return {
        "total": total,
        "eligible": eligible,
        "suppressed": suppressed,
        "no_email": no_email,
        "already_snapshotted": snapshotted,
    }


def materialize_campaign_recipients(db: Session, org: Organization, campaign: MarketingCampaign) -> None:
    existing = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == campaign.id).count()
    if existing:
        return
    template = db.query(MarketingTemplate).filter(MarketingTemplate.id == campaign.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    sender = resolve_sender(db, org, campaign.sender_lane)
    members = get_audience_members(db, org, campaign_filters(db, campaign))
    review = {"total": len(members), "eligible": 0, "suppressed": 0, "no_email": 0}

    for member in members:
        email = (member.user.email or "").strip().lower()
        if not email:
            review["no_email"] += 1
            continue
        suppression = is_suppressed(db, org, email)
        if suppression:
            review["suppressed"] += 1
            recipient = CampaignRecipient(
                organization_id=org.id,
                tenant_id=org.id,
                campaign_id=campaign.id,
                user_id=member.user.id,
                email=email,
                status="suppressed",
                suppression_reason=suppression.reason,
            )
            db.add(recipient)
            continue

        review["eligible"] += 1
        recipient = CampaignRecipient(
            organization_id=org.id,
            tenant_id=org.id,
            campaign_id=campaign.id,
            user_id=member.user.id,
            email=email,
            status="queued",
        )
        db.add(recipient)
        db.flush()

        context = member_context(db, org, member.user)
        subject, html, text, missing = render_marketing_template(template, context)
        if missing:
            recipient.status = "failed"
            recipient.suppression_reason = "render_missing_value"
            campaign.failed_count += 1
            continue

        outbound = OutboundMessage(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=member.user.id,
            campaign_id=campaign.id,
            campaign_recipient_id=recipient.id,
            template_id=template.id,
            email=email,
            subject=subject,
            html_body=html,
            text_body=text,
            sender_lane=sender.lane,
            from_email=sender.from_email,
            from_name=sender.from_name,
            status="queued",
            source="campaign",
            source_context={"campaign_public_id": campaign.public_id},
        )
        db.add(outbound)
        db.flush()

        context = member_context(db, org, member.user, outbound=outbound)
        subject, html, text, _missing = render_marketing_template(template, context)
        outbound.subject = subject
        outbound.html_body = html
        outbound.text_body = text
        recipient.rendered_subject = subject
        recipient.rendered_html = html
        recipient.rendered_text = text
        recipient.outbound_message_id = outbound.id

    campaign.total_count = review["total"]
    campaign.eligible_count = review["eligible"]
    campaign.suppressed_count = review["suppressed"]
    campaign.no_email_count = review["no_email"]
    campaign.queued_count = review["eligible"]
    db.add(campaign)
    db.commit()
    recount_campaign_counters(db, campaign.id)


def send_campaign(db: Session, org: Organization, campaign: MarketingCampaign, scheduled_at: datetime | None = None) -> MarketingCampaign:
    if campaign.status in {"sent", "sending", "canceled"}:
        raise HTTPException(status_code=400, detail="Campaign cannot be sent in its current status")
    if scheduled_at:
        campaign.scheduled_at = scheduled_at
    if campaign.scheduled_at and utc_or_none(campaign.scheduled_at) and utc_or_none(campaign.scheduled_at) > now_utc():
        campaign.status = "scheduled"
        db.add(campaign)
        db.commit()
        db.refresh(campaign)
        materialize_campaign_recipients(db, org, campaign)
        return campaign

    campaign.status = "sending"
    campaign.sent_started_at = now_utc()
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    materialize_campaign_recipients(db, org, campaign)

    queued = (
        db.query(OutboundMessage)
        .filter(OutboundMessage.campaign_id == campaign.id, OutboundMessage.status == "queued")
        .all()
    )
    for outbound in queued:
        dispatch_outbound(db, org, outbound)

    campaign.status = "sent"
    campaign.sent_finished_at = now_utc()
    db.add(campaign)
    db.commit()
    recount_campaign_counters(db, campaign.id)
    db.refresh(campaign)
    return campaign


def daily_count_for_lane(db: Session, org: Organization, lane: str) -> int:
    start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.organization_id == org.id,
            OutboundMessage.sender_lane == lane,
            OutboundMessage.created_at >= start,
            OutboundMessage.status.in_(["sent", "delivered", "opened", "clicked", "bounced", "unsubscribed"]),
        )
        .count()
    )


def dispatch_outbound(db: Session, org: Organization, outbound: OutboundMessage) -> OutboundMessage:
    if outbound.status != "queued":
        return outbound
    if is_suppressed(db, org, outbound.email):
        outbound.status = "suppressed"
        outbound.error = "Recipient is suppressed"
        db.add(outbound)
        db.commit()
        _sync_recipient_from_outbound(db, outbound)
        return outbound

    sender = resolve_sender(db, org, outbound.sender_lane)
    if daily_count_for_lane(db, org, sender.lane) >= sender.daily_cap:
        outbound.status = "failed"
        outbound.error = "Daily sender cap exceeded"
        db.add(outbound)
        db.commit()
        _sync_recipient_from_outbound(db, outbound)
        return outbound

    payload: dict[str, Any] = {
        "personalizations": [
            {
                "to": [{"email": outbound.email}],
                "custom_args": {
                    "outbound_public_id": outbound.public_id,
                    "organization_public_id": org.public_id,
                },
            }
        ],
        "from": {"email": sender.from_email},
        "subject": outbound.subject,
        "content": [],
    }
    if sender.from_name:
        payload["from"]["name"] = sender.from_name
    if outbound.text_body:
        payload["content"].append({"type": "text/plain", "value": outbound.text_body})
    if outbound.html_body:
        payload["content"].append({"type": "text/html", "value": outbound.html_body})
    if not payload["content"]:
        payload["content"].append({"type": "text/plain", "value": ""})
    if outbound.campaign_id:
        payload["personalizations"][0]["custom_args"]["campaign_id"] = str(outbound.campaign_id)
    if outbound.workflow_run_id:
        payload["personalizations"][0]["custom_args"]["workflow_run_id"] = str(outbound.workflow_run_id)
    if settings.SENDGRID_MARKETING_ASM_GROUP_ID:
        payload["asm"] = {"group_id": settings.SENDGRID_MARKETING_ASM_GROUP_ID}

    if not settings.SENDGRID_API_KEY:
        outbound.status = "sent"
        outbound.provider_message_id = f"local-{outbound.public_id}"
        outbound.sent_at = now_utc()
        outbound.source_context = {**(outbound.source_context or {}), "sendgrid_skipped": "not_configured"}
        db.add(outbound)
        db.commit()
        _sync_recipient_from_outbound(db, outbound)
        return outbound

    try:
        response = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            json=payload,
            timeout=10.0,
        )
        if response.status_code >= 400:
            outbound.status = "failed"
            outbound.error = response.text[:2000]
        else:
            outbound.status = "sent"
            outbound.provider_message_id = response.headers.get("X-Message-Id") or response.headers.get("x-message-id")
            outbound.sent_at = now_utc()
    except Exception as exc:  # noqa: BLE001
        logger.exception("marketing send failed")
        outbound.status = "failed"
        outbound.error = str(exc)
    db.add(outbound)
    db.commit()
    _sync_recipient_from_outbound(db, outbound)
    return outbound


def _sync_recipient_from_outbound(db: Session, outbound: OutboundMessage) -> None:
    if outbound.campaign_recipient_id:
        recipient = db.query(CampaignRecipient).filter(CampaignRecipient.id == outbound.campaign_recipient_id).first()
        if recipient:
            recipient.status = outbound.status
            recipient.provider_message_id = outbound.provider_message_id
            db.add(recipient)
    if outbound.campaign_id:
        recount_campaign_counters(db, outbound.campaign_id)
    db.commit()


def recount_campaign_counters(db: Session, campaign_id: int) -> None:
    campaign = db.query(MarketingCampaign).filter(MarketingCampaign.id == campaign_id).first()
    if not campaign:
        return
    recipients = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == campaign_id).all()
    outbounds = db.query(OutboundMessage).filter(OutboundMessage.campaign_id == campaign_id).all()
    campaign.queued_count = sum(1 for row in outbounds if row.status == "queued")
    campaign.sent_count = sum(1 for row in outbounds if row.status in {"sent", "delivered", "opened", "clicked"})
    campaign.delivered_count = sum(1 for row in outbounds if row.status in {"delivered", "opened", "clicked"})
    campaign.opened_count = sum(1 for row in outbounds if row.opens > 0 or row.status in {"opened", "clicked"})
    campaign.clicked_count = sum(1 for row in outbounds if row.clicks > 0 or row.status == "clicked")
    campaign.bounced_count = sum(1 for row in outbounds if row.status == "bounced")
    campaign.failed_count = sum(1 for row in outbounds if row.status == "failed") + sum(
        1 for row in recipients if row.status == "failed" and not row.outbound_message_id
    )
    campaign.unsubscribed_count = sum(1 for row in recipients if row.status == "unsubscribed")
    db.add(campaign)
    db.commit()


def process_sendgrid_events(db: Session, payload: list[dict[str, Any]] | dict[str, Any]) -> dict[str, int]:
    events = payload if isinstance(payload, list) else [payload]
    processed = 0
    skipped = 0
    for event in events:
        sg_event_id = str(event.get("sg_event_id") or event.get("smtp-id") or event.get("event_id") or "")
        if not sg_event_id:
            sg_event_id = hashlib.sha256(json.dumps(event, sort_keys=True).encode()).hexdigest()
        if db.query(EmailEvent).filter(EmailEvent.sg_event_id == sg_event_id).first():
            skipped += 1
            continue
        email = str(event.get("email") or "").lower()
        event_type = str(event.get("event") or "")
        sg_message_id = str(event.get("sg_message_id") or event.get("smtp-id") or "")
        outbound_public_id = event.get("outbound_public_id") or (event.get("marketing") or {}).get("outbound_public_id")
        custom_args = event.get("custom_args") or {}
        outbound_public_id = outbound_public_id or custom_args.get("outbound_public_id")
        outbound = None
        if outbound_public_id:
            outbound = db.query(OutboundMessage).filter(OutboundMessage.public_id == outbound_public_id).first()
        if not outbound and sg_message_id:
            outbound = (
                db.query(OutboundMessage)
                .filter(OutboundMessage.provider_message_id == sg_message_id)
                .first()
            )
            if not outbound:
                candidates = db.query(OutboundMessage).filter(OutboundMessage.provider_message_id.isnot(None)).all()
                outbound = next(
                    (candidate for candidate in candidates if sg_message_id.startswith(candidate.provider_message_id or "")),
                    None,
                )
        user_id = outbound.user_id if outbound else None
        tenant_id = outbound.tenant_id if outbound else None
        email_event = EmailEvent(
            sg_event_id=sg_event_id,
            sg_message_id=sg_message_id or None,
            email=email or (outbound.email if outbound else ""),
            event_type=event_type,
            reason=event.get("reason"),
            status=event.get("status"),
            response=event.get("response"),
            ip=event.get("ip"),
            user_agent=event.get("useragent") or event.get("user_agent"),
            url=event.get("url"),
            asm_group_id=event.get("asm_group_id"),
            sg_event_timestamp=_timestamp_to_datetime(event.get("timestamp")),
            payload=event,
            user_id=user_id,
            tenant_id=tenant_id,
            created_at=now_utc(),
        )
        db.add(email_event)

        if outbound:
            apply_sendgrid_event_to_outbound(db, outbound, event_type, event)
        processed += 1
    db.commit()
    return {"processed": processed, "skipped": skipped}


def verify_sendgrid_webhook_signature(body: bytes, signature: str | None, timestamp: str | None) -> None:
    if not settings.SENDGRID_WEBHOOK_VERIFICATION_KEY:
        return
    if not signature or not timestamp:
        raise HTTPException(status_code=401, detail="Missing SendGrid webhook signature")
    try:
        public_key = _load_sendgrid_public_key(settings.SENDGRID_WEBHOOK_VERIFICATION_KEY)
        public_key.verify(base64.b64decode(signature), timestamp.encode() + body, ec.ECDSA(SHA256()))
    except (InvalidSignature, ValueError, TypeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid SendGrid webhook signature") from exc


def _load_sendgrid_public_key(raw_key: str):
    key = raw_key.strip().encode()
    if key.startswith(b"-----BEGIN"):
        return load_pem_public_key(key)
    return load_der_public_key(base64.b64decode(key))


def _timestamp_to_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def apply_sendgrid_event_to_outbound(db: Session, outbound: OutboundMessage, event_type: str, event: dict[str, Any]) -> None:
    event_at = _timestamp_to_datetime(event.get("timestamp")) or now_utc()
    outbound.last_event_at = event_at
    if event_type == "delivered":
        outbound.status = "delivered"
    elif event_type == "open":
        outbound.opens = (outbound.opens or 0) + 1
        outbound.status = "opened"
    elif event_type == "click":
        outbound.clicks = (outbound.clicks or 0) + 1
        outbound.status = "clicked"
    elif event_type in {"bounce", "dropped"}:
        outbound.status = "bounced" if event_type == "bounce" else "failed"
        outbound.error = event.get("reason") or event.get("response")
    elif event_type in {"spamreport", "unsubscribe", "group_unsubscribe"}:
        outbound.status = "unsubscribed"
    db.add(outbound)
    org = db.query(Organization).filter(Organization.id == outbound.organization_id).first()
    if org and event_type in {"bounce", "spamreport", "unsubscribe", "group_unsubscribe"}:
        reason = "spam" if event_type == "spamreport" else "bounce" if event_type == "bounce" else "unsubscribe"
        upsert_suppression(
            db,
            org,
            outbound.email,
            reason,
            user_id=outbound.user_id,
            source="sendgrid",
            source_event_id=str(event.get("sg_event_id") or ""),
        )
    if outbound.campaign_recipient_id:
        recipient = db.query(CampaignRecipient).filter(CampaignRecipient.id == outbound.campaign_recipient_id).first()
        if recipient:
            recipient.status = outbound.status
            db.add(recipient)
    if outbound.campaign_id:
        recount_campaign_counters(db, outbound.campaign_id)


def refresh_verified_sender(db: Session, sender: MarketingVerifiedSender) -> MarketingVerifiedSender:
    sender.last_checked_at = now_utc()
    if settings.SENDGRID_API_KEY and sender.sendgrid_sender_id:
        try:
            response = httpx.get(
                f"https://api.sendgrid.com/v3/verified_senders/{sender.sendgrid_sender_id}",
                headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
                timeout=10.0,
            )
            if response.status_code < 400:
                body = response.json()
                sender.status = "verified" if body.get("verified") or body.get("verified_at") else "pending"
        except Exception:  # noqa: BLE001
            logger.exception("verified sender refresh failed")
    db.add(sender)
    db.commit()
    db.refresh(sender)
    return sender


def publish_workflow(db: Session, workflow: Workflow, actor_id: int) -> WorkflowVersion:
    last_version = (
        db.query(func.coalesce(func.max(WorkflowVersion.version_number), 0))
        .filter(WorkflowVersion.workflow_id == workflow.id)
        .scalar()
        or 0
    )
    version = WorkflowVersion(
        organization_id=workflow.organization_id,
        tenant_id=workflow.tenant_id,
        workflow_id=workflow.id,
        version_number=last_version + 1,
        graph=workflow.graph or {},
        status="published",
        published_at=now_utc(),
        published_by_user_id=actor_id,
    )
    db.add(version)
    db.flush()
    workflow.current_version_id = version.id
    workflow.status = "paused"
    db.add(workflow)
    db.commit()
    db.refresh(version)
    return version


def activate_workflow(db: Session, org: Organization, workflow: Workflow) -> Workflow:
    if not workflow.current_version_id:
        raise HTTPException(status_code=400, detail="Workflow must be published before activation")
    workflow.status = "active"
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    enqueue_segment_entry_runs(db, org, workflow)
    return workflow


def enqueue_segment_entry_runs(db: Session, org: Organization, workflow: Workflow) -> int:
    version = db.query(WorkflowVersion).filter(WorkflowVersion.id == workflow.current_version_id).first()
    if not version:
        return 0
    graph = version.graph or {}
    trigger = _first_node(graph, "trigger")
    if not trigger:
        return 0
    data = trigger.get("data") or {}
    if data.get("trigger") not in {None, "segment_entry"}:
        return 0
    filters = data.get("filters") or {}
    segment_public_id = data.get("segment_public_id")
    if segment_public_id:
        segment = (
            db.query(AudienceSegment)
            .filter(AudienceSegment.organization_id == org.id, AudienceSegment.public_id == segment_public_id)
            .first()
        )
        if segment:
            filters = segment.filters or {}
    next_node = _next_node_id(graph, trigger.get("id"))
    if not next_node:
        return 0
    created = 0
    for member in get_audience_members(db, org, filters):
        existing = (
            db.query(WorkflowRun)
            .filter(
                WorkflowRun.workflow_id == workflow.id,
                WorkflowRun.workflow_version_id == version.id,
                WorkflowRun.user_id == member.user.id,
                WorkflowRun.status.in_(["running", "waiting"]),
            )
            .first()
        )
        if existing:
            continue
        run = WorkflowRun(
            organization_id=org.id,
            tenant_id=org.id,
            workflow_id=workflow.id,
            workflow_version_id=version.id,
            user_id=member.user.id,
            status="running",
            current_node_id=next_node,
            next_run_at=now_utc(),
            context={"trigger": "segment_entry"},
            started_at=now_utc(),
        )
        db.add(run)
        created += 1
    db.commit()
    return created


def tick_marketing(db: Session, limit: int = 100) -> dict[str, int]:
    now = now_utc()
    campaigns = (
        db.query(MarketingCampaign)
        .filter(MarketingCampaign.status == "scheduled", MarketingCampaign.scheduled_at <= now)
        .limit(limit)
        .all()
    )
    sent_campaigns = 0
    for campaign in campaigns:
        org = db.query(Organization).filter(Organization.id == campaign.organization_id).first()
        if org:
            send_campaign(db, org, campaign)
            sent_campaigns += 1

    outbounds = db.query(OutboundMessage).filter(OutboundMessage.status == "queued").limit(limit).all()
    dispatched = 0
    for outbound in outbounds:
        org = db.query(Organization).filter(Organization.id == outbound.organization_id).first()
        if org:
            dispatch_outbound(db, org, outbound)
            dispatched += 1

    active_workflows = db.query(Workflow).filter(Workflow.status == "active").all()
    for workflow in active_workflows:
        org = db.query(Organization).filter(Organization.id == workflow.organization_id).first()
        if org:
            enqueue_segment_entry_runs(db, org, workflow)

    runs = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.status.in_(["running", "waiting"]), WorkflowRun.next_run_at <= now)
        .limit(limit)
        .all()
    )
    advanced = 0
    for run in runs:
        if advance_workflow_run(db, run):
            advanced += 1
    return {"campaigns_sent": sent_campaigns, "outbounds_dispatched": dispatched, "workflow_runs_advanced": advanced}


def advance_workflow_run(db: Session, run: WorkflowRun) -> bool:
    workflow = db.query(Workflow).filter(Workflow.id == run.workflow_id, Workflow.status == "active").first()
    version = db.query(WorkflowVersion).filter(WorkflowVersion.id == run.workflow_version_id).first()
    org = db.query(Organization).filter(Organization.id == run.organization_id).first()
    user = db.query(User).filter(User.id == run.user_id).first()
    if not workflow or not version or not org or not user:
        run.status = "failed"
        run.finished_at = now_utc()
        db.add(run)
        db.commit()
        return False
    graph = version.graph or {}
    node = _node_by_id(graph, run.current_node_id)
    if not node:
        run.status = "completed"
        run.finished_at = now_utc()
        db.add(run)
        db.commit()
        return True

    node_type = node.get("type")
    data = node.get("data") or {}
    if node_type == "wait":
        if run.status != "waiting":
            amount = int(data.get("amount") or data.get("minutes") or 1)
            unit = data.get("unit") or ("minutes" if data.get("minutes") else "days")
            delta = timedelta(days=amount) if unit == "days" else timedelta(hours=amount) if unit == "hours" else timedelta(minutes=amount)
            run.status = "waiting"
            run.next_run_at = now_utc() + delta
            _log_workflow_event(db, run, node, "wait_scheduled", "waiting", {"until": run.next_run_at.isoformat()})
        else:
            run.status = "running"
            run.current_node_id = _next_node_id(graph, node.get("id"))
            run.next_run_at = now_utc()
            _log_workflow_event(db, run, node, "wait_completed", "completed", {})
    elif node_type == "send_email":
        template_public_id = data.get("template_public_id")
        template = (
            db.query(MarketingTemplate)
            .filter(MarketingTemplate.organization_id == org.id, MarketingTemplate.public_id == template_public_id)
            .first()
        )
        if template:
            create_workflow_outbound(db, org, workflow, run, template, user, data.get("sender_lane"))
        run.current_node_id = _next_node_id(graph, node.get("id"))
        run.next_run_at = now_utc()
        _log_workflow_event(db, run, node, "send_email", "completed", {"template_public_id": template_public_id})
    elif node_type == "condition":
        filters = data.get("filters") or {}
        member = AudienceMember(
            user=user,
            record=db.query(OrgMemberProfile).filter(OrgMemberProfile.organization_id == org.id, OrgMemberProfile.user_id == user.id).first(),
            stats=compute_member_stats(db, org.id, user.id),
            tags=[],
        )
        member.tags = decode_tags(member.record.tags if member.record else None)
        passed = _member_matches_filters(member, filters)
        run.current_node_id = _next_node_id(graph, node.get("id"), "true" if passed else "false") or _next_node_id(graph, node.get("id"))
        run.next_run_at = now_utc()
        _log_workflow_event(db, run, node, "condition", "completed", {"passed": passed})
    elif node_type == "notify_owner":
        owner = db.query(User).filter(User.id == org.owner_id).first()
        if owner:
            send_email(owner.email, data.get("subject") or f"Workflow notice: {workflow.name}", data.get("body") or f"{user.email} reached {node.get('id')}")
        run.current_node_id = _next_node_id(graph, node.get("id"))
        run.next_run_at = now_utc()
        _log_workflow_event(db, run, node, "notify_owner", "completed", {})
    elif node_type == "add_tag":
        tag = str(data.get("tag") or "").strip()
        if tag:
            record = (
                db.query(OrgMemberProfile)
                .filter(OrgMemberProfile.organization_id == org.id, OrgMemberProfile.user_id == user.id)
                .first()
            )
            if not record:
                record = OrgMemberProfile(organization_id=org.id, tenant_id=org.id, user_id=user.id, status="active")
            tags = set(decode_tags(record.tags))
            tags.add(tag)
            record.tags = encode_tags(tags)
            db.add(record)
        run.current_node_id = _next_node_id(graph, node.get("id"))
        run.next_run_at = now_utc()
        _log_workflow_event(db, run, node, "add_tag", "completed", {"tag": tag})
    elif node_type == "stop":
        run.status = "completed"
        run.finished_at = now_utc()
        run.next_run_at = None
        _log_workflow_event(db, run, node, "stop", "completed", {})
    else:
        run.current_node_id = _next_node_id(graph, node.get("id"))
        run.next_run_at = now_utc()
        _log_workflow_event(db, run, node, f"node_{node_type}", "completed", {})

    if not run.current_node_id and run.status in {"running", "waiting"}:
        run.status = "completed"
        run.finished_at = now_utc()
        run.next_run_at = None
    db.add(run)
    db.commit()
    return True


def create_workflow_outbound(
    db: Session,
    org: Organization,
    workflow: Workflow,
    run: WorkflowRun,
    template: MarketingTemplate,
    user: User,
    sender_lane: str | None,
) -> OutboundMessage:
    sender = resolve_sender(db, org, sender_lane)
    context = member_context(db, org, user)
    subject, html, text, missing = render_marketing_template(template, context)
    outbound = OutboundMessage(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=user.id,
        workflow_id=workflow.id,
        workflow_run_id=run.id,
        template_id=template.id,
        email=user.email,
        subject=subject,
        html_body=html,
        text_body=text,
        sender_lane=sender.lane,
        from_email=sender.from_email,
        from_name=sender.from_name,
        status="failed" if missing else "queued",
        error=", ".join(missing) if missing else None,
        source="workflow",
        source_context={"workflow_public_id": workflow.public_id, "workflow_run_public_id": run.public_id},
    )
    db.add(outbound)
    db.flush()
    if not missing:
        context = member_context(db, org, user, outbound=outbound)
        subject, html, text, _ = render_marketing_template(template, context)
        outbound.subject = subject
        outbound.html_body = html
        outbound.text_body = text
        db.add(outbound)
        db.commit()
        dispatch_outbound(db, org, outbound)
    else:
        db.commit()
    return outbound


def _log_workflow_event(db: Session, run: WorkflowRun, node: dict[str, Any], event_type: str, status: str, data: dict[str, Any]) -> None:
    db.add(
        WorkflowRunEvent(
            organization_id=run.organization_id,
            tenant_id=run.tenant_id,
            workflow_id=run.workflow_id,
            workflow_run_id=run.id,
            node_id=node.get("id"),
            event_type=event_type,
            status=status,
            data=data,
        )
    )


def _first_node(graph: dict[str, Any], node_type: str) -> dict[str, Any] | None:
    for node in graph.get("nodes") or []:
        if node.get("type") == node_type:
            return node
    return None


def _node_by_id(graph: dict[str, Any], node_id: str | None) -> dict[str, Any] | None:
    if not node_id:
        return None
    for node in graph.get("nodes") or []:
        if node.get("id") == node_id:
            return node
    return None


def _next_node_id(graph: dict[str, Any], node_id: str | None, source_handle: str | None = None) -> str | None:
    if not node_id:
        return None
    edges = [edge for edge in graph.get("edges") or [] if edge.get("source") == node_id]
    if source_handle:
        for edge in edges:
            if edge.get("sourceHandle") == source_handle or edge.get("label") == source_handle:
                return edge.get("target")
    return edges[0].get("target") if edges else None


def make_default_workflow_graph() -> dict[str, Any]:
    return {
        "nodes": [
            {"id": "trigger", "type": "trigger", "position": {"x": 0, "y": 0}, "data": {"label": "Segment entry", "trigger": "segment_entry"}},
            {"id": "stop", "type": "stop", "position": {"x": 320, "y": 0}, "data": {"label": "Stop"}},
        ],
        "edges": [{"id": "trigger-stop", "source": "trigger", "target": "stop"}],
    }


def new_public_id_value() -> str:
    return new_public_id()
