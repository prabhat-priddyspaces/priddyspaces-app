from __future__ import annotations

import calendar
import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, PaymentStatus, UserRole
from app.models.location import Location
from app.models.marketing import OutboundMessage
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.owner_payment_health import (
    OwnerPaymentHealthAffectedSpaceOut,
    OwnerPaymentHealthCardNoticeOut,
    OwnerPaymentHealthCardNoticeResultOut,
    OwnerPaymentHealthCardOut,
    OwnerPaymentHealthCardsOut,
    OwnerPaymentHealthNoticeOut,
    OwnerPaymentHealthSummaryOut,
)
from app.services.authz import list_org_members
from app.services.booking_email_delivery import BOOKING_EMAIL_CARD_EXPIRING
from app.services.notifications import send_card_expiring_email

OPEN_REQUEST_STATUSES = {
    BookingRequestStatus.REQUESTED,
    BookingRequestStatus.APPROVED,
    BookingRequestStatus.PAYMENT_FAILED,
}
RISK_PAYMENT_STATUSES = {
    PaymentStatus.REQUIRES_PAYMENT,
    PaymentStatus.FAILED,
}
RECENT_PAYMENT_STATUSES = {
    PaymentStatus.SUCCEEDED,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
    PaymentStatus.VOIDED,
}
NOTICE_ATTEMPT_STATUSES = {"queued", "sent", "delivered", "opened", "clicked", "failed", "bounced"}
DEFAULT_EXPIRING_WINDOW_DAYS = 30
RECENT_VOLUME_DAYS = 180


@dataclass
class SpaceImpact:
    space: Space
    location: Location | None
    sources: set[str] = field(default_factory=set)
    open_request_count: int = 0
    future_booking_count: int = 0
    active_subscription_count: int = 0


@dataclass
class MethodImpact:
    affected_spaces: dict[int, SpaceImpact] = field(default_factory=dict)
    open_booking_request_count: int = 0
    future_booking_count: int = 0
    active_subscription_count: int = 0
    upcoming_booking_value_cents: int = 0
    recent_paid_volume_cents: int = 0


def today_utc_date() -> date:
    return datetime.now(timezone.utc).date()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _payment_amount_cents(payment: Payment) -> int:
    if payment.amount_cents is not None:
        return int(payment.amount_cents)
    return int(payment.amount or 0) * 100


def _request_amount_cents(req: BookingRequest) -> int:
    if not req.pricing_snapshot:
        return 0
    try:
        snapshot = json.loads(req.pricing_snapshot)
    except (TypeError, json.JSONDecodeError):
        return 0
    if not isinstance(snapshot, dict):
        return 0
    for key in ("total_cents", "total_amount_cents", "amount_cents"):
        value = snapshot.get(key)
        if value in (None, ""):
            continue
        try:
            amount = int(value)
        except (TypeError, ValueError):
            continue
        if amount >= 0:
            return amount
    return 0


def card_expiry_date(exp_month: int | None, exp_year: int | None) -> date | None:
    if exp_year is None or exp_month is None:
        return None
    if exp_year < 2000 or exp_month < 1 or exp_month > 12:
        return None
    return date(exp_year, exp_month, calendar.monthrange(exp_year, exp_month)[1])


def card_expiry_label(exp_month: int | None, exp_year: int | None) -> str | None:
    if exp_month is None or exp_year is None:
        return None
    if exp_month < 1 or exp_month > 12:
        return None
    return f"{exp_month:02d}/{exp_year}"


def card_notice_expiry_key(method: MemberOwnerPaymentMethod) -> str:
    return card_expiry_label(method.exp_month, method.exp_year) or "missing"


def classify_card_status(
    exp_month: int | None,
    exp_year: int | None,
    *,
    today: date | None = None,
    window_days: int = DEFAULT_EXPIRING_WINDOW_DAYS,
) -> str:
    expiry = card_expiry_date(exp_month, exp_year)
    if expiry is None:
        return "missing_expiry"
    today = today or today_utc_date()
    if expiry < today:
        return "expired"
    if expiry <= today + timedelta(days=max(0, window_days)):
        return "expiring"
    return "healthy"


def _space_type(space: Space | None) -> str | None:
    if not space:
        return None
    value = space.space_type
    return value.value if hasattr(value, "value") else str(value)


def _member_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or " ".join(part for part in [user.first_name, user.last_name] if part) or None


def _accessible_orgs(
    db: Session,
    user_id: int,
    organization_public_id: str | None = None,
) -> list[Organization]:
    memberships = list_org_members(db, user_id, {UserRole.OWNER, UserRole.ADMIN})
    org_ids = sorted({membership.organization_id for membership in memberships})
    if not org_ids:
        raise HTTPException(status_code=403, detail="No finance organization access")
    query = db.query(Organization).filter(Organization.id.in_(org_ids))
    if organization_public_id:
        query = query.filter(Organization.public_id == organization_public_id)
    orgs = query.order_by(Organization.name.asc()).all()
    if organization_public_id and not orgs:
        raise HTTPException(status_code=404, detail="Organization not found")
    return orgs


def _location_for_filter(db: Session, org_ids: set[int], location_public_id: str | None) -> Location | None:
    if not location_public_id:
        return None
    location = (
        db.query(Location)
        .filter(Location.public_id == location_public_id, Location.organization_id.in_(org_ids))
        .first()
    )
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


def _space_with_location(db: Session, space_id: int | None) -> tuple[Space | None, Location | None]:
    if not space_id:
        return None, None
    space = db.query(Space).filter(Space.id == space_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    return space, location


def _add_space_impact(
    impact: MethodImpact,
    *,
    space: Space | None,
    location: Location | None,
    source: str,
) -> SpaceImpact | None:
    if not space:
        return None
    item = impact.affected_spaces.get(space.id)
    if item is None:
        item = SpaceImpact(space=space, location=location)
        impact.affected_spaces[space.id] = item
    item.sources.add(source)
    return item


def _method_impact(db: Session, method: MemberOwnerPaymentMethod, generated_at: datetime) -> MethodImpact:
    impact = MethodImpact()
    now = _as_utc(generated_at) or now_utc()
    recent_start = now - timedelta(days=RECENT_VOLUME_DAYS)

    requests = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.member_owner_payment_method_id == method.id,
            BookingRequest.status.in_(OPEN_REQUEST_STATUSES),
        )
        .all()
    )
    for req in requests:
        space, location = _space_with_location(db, req.space_id)
        item = _add_space_impact(impact, space=space, location=location, source="open_request")
        if item:
            item.open_request_count += 1
        impact.open_booking_request_count += 1
        impact.upcoming_booking_value_cents += _request_amount_cents(req)

    payments = (
        db.query(Payment)
        .filter(Payment.payment_method_id == method.id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .all()
    )
    seen_future_bookings: set[int] = set()
    seen_active_subscriptions: set[int] = set()
    for payment in payments:
        created_at = _as_utc(payment.created_at)
        if payment.status in RECENT_PAYMENT_STATUSES and (created_at is None or created_at >= recent_start):
            impact.recent_paid_volume_cents += _payment_amount_cents(payment)

        if payment.booking_id and payment.booking_id not in seen_future_bookings:
            booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
            booking_start = _as_utc(booking.start_datetime) if booking else None
            if booking and booking_start and booking_start >= now:
                space, location = _space_with_location(db, booking.space_id)
                item = _add_space_impact(impact, space=space, location=location, source="future_booking")
                if item:
                    item.future_booking_count += 1
                impact.future_booking_count += 1
                seen_future_bookings.add(booking.id)
                if payment.status in RISK_PAYMENT_STATUSES:
                    impact.upcoming_booking_value_cents += _payment_amount_cents(payment)

        if payment.subscription_id and payment.subscription_id not in seen_active_subscriptions:
            subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
            if subscription and subscription.status in {"active", "past_due"}:
                space, location = _space_with_location(db, subscription.space_id)
                item = _add_space_impact(impact, space=space, location=location, source="active_subscription")
                if item:
                    item.active_subscription_count += 1
                impact.active_subscription_count += 1
                seen_active_subscriptions.add(subscription.id)

    return impact


def _notice_out(outbound: OutboundMessage | None) -> OwnerPaymentHealthNoticeOut | None:
    if not outbound:
        return None
    return OwnerPaymentHealthNoticeOut(
        public_id=outbound.public_id,
        status=outbound.status,
        subject=outbound.subject,
        error=outbound.error,
        sent_at=outbound.sent_at,
        last_event_at=outbound.last_event_at,
        created_at=outbound.created_at,
    )


def latest_card_notice(
    db: Session,
    method: MemberOwnerPaymentMethod,
    *,
    expiry_key: str | None = None,
) -> OutboundMessage | None:
    expiry_key = expiry_key or card_notice_expiry_key(method)
    rows = (
        db.query(OutboundMessage)
        .filter(
            OutboundMessage.user_id == method.user_id,
            OutboundMessage.tenant_id == method.organization_id,
        )
        .order_by(OutboundMessage.created_at.desc(), OutboundMessage.id.desc())
        .all()
    )
    for row in rows:
        context = row.source_context or {}
        if (
            context.get("notification_type") == BOOKING_EMAIL_CARD_EXPIRING
            and context.get("member_owner_payment_method_public_id") == method.public_id
            and context.get("card_expiry") == expiry_key
        ):
            return row
    return None


def card_notice_exists(db: Session, method: MemberOwnerPaymentMethod) -> bool:
    return latest_card_notice(db, method) is not None


def _affected_space_out(impact: SpaceImpact) -> OwnerPaymentHealthAffectedSpaceOut:
    return OwnerPaymentHealthAffectedSpaceOut(
        space_public_id=impact.space.public_id,
        space_name=impact.space.name,
        space_type=_space_type(impact.space),
        location_public_id=impact.location.public_id if impact.location else None,
        location_name=impact.location.name if impact.location else None,
        location_city=impact.location.city if impact.location else None,
        sources=sorted(impact.sources),
        open_request_count=impact.open_request_count,
        future_booking_count=impact.future_booking_count,
        active_subscription_count=impact.active_subscription_count,
    )


def _matches_location(row: OwnerPaymentHealthCardOut, location_public_id: str | None) -> bool:
    if not location_public_id:
        return True
    return any(space.location_public_id == location_public_id for space in row.affected_spaces)


def _matches_search(row: OwnerPaymentHealthCardOut, search: str | None) -> bool:
    if not search:
        return True
    needle = search.strip().lower()
    if not needle:
        return True
    haystack = " ".join(
        [
            row.member_name or "",
            row.member_email or "",
            row.card_brand or "",
            row.card_last4 or "",
            row.organization_name,
            " ".join(space.space_name or "" for space in row.affected_spaces),
            " ".join(space.location_name or "" for space in row.affected_spaces),
        ]
    ).lower()
    return needle in haystack


def _matches_status(row: OwnerPaymentHealthCardOut, status: str | None) -> bool:
    normalized = (status or "at_risk").strip().lower()
    if normalized in {"", "all"}:
        return True
    if normalized == "at_risk":
        return row.card_status in {"expired", "expiring", "missing_expiry"}
    return row.card_status == normalized


def owner_payment_health_cards(
    db: Session,
    *,
    user_id: int,
    organization_public_id: str | None = None,
    status: str | None = None,
    window_days: int = DEFAULT_EXPIRING_WINDOW_DAYS,
    location_public_id: str | None = None,
    search: str | None = None,
) -> OwnerPaymentHealthCardsOut:
    generated_at = now_utc()
    orgs = _accessible_orgs(db, user_id, organization_public_id)
    org_by_id = {org.id: org for org in orgs}
    _location_for_filter(db, set(org_by_id), location_public_id)
    org_ids = list(org_by_id)
    methods = (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.organization_id.in_(org_ids),
            MemberOwnerPaymentMethod.status.in_(["active", "expiring", "expired"]),
        )
        .order_by(MemberOwnerPaymentMethod.updated_at.desc(), MemberOwnerPaymentMethod.id.desc())
        .all()
    )
    user_ids = {method.user_id for method in methods}
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    rows: list[OwnerPaymentHealthCardOut] = []
    today = today_utc_date()
    for method in methods:
        org = org_by_id.get(method.organization_id)
        if not org:
            continue
        user = users.get(method.user_id)
        impact = _method_impact(db, method, generated_at)
        notice = latest_card_notice(db, method)
        card_status = classify_card_status(
            method.exp_month,
            method.exp_year,
            today=today,
            window_days=window_days,
        )
        row = OwnerPaymentHealthCardOut(
            public_id=method.public_id,
            organization_public_id=org.public_id,
            organization_name=org.name,
            member_public_id=user.public_id if user else None,
            member_name=_member_name(user),
            member_email=user.email if user else None,
            provider=method.provider,
            payment_method_status=method.status,
            card_status=card_status,
            card_brand=method.brand,
            card_last4=method.last4,
            exp_month=method.exp_month,
            exp_year=method.exp_year,
            expiry_label=card_expiry_label(method.exp_month, method.exp_year),
            is_default_for_owner=method.is_default_for_owner,
            affected_spaces=[
                _affected_space_out(space_impact)
                for space_impact in sorted(
                    impact.affected_spaces.values(),
                    key=lambda item: ((item.location.name if item.location else ""), item.space.name or ""),
                )
            ],
            open_booking_request_count=impact.open_booking_request_count,
            future_booking_count=impact.future_booking_count,
            active_subscription_count=impact.active_subscription_count,
            upcoming_booking_value_cents=impact.upcoming_booking_value_cents,
            recent_paid_volume_cents=impact.recent_paid_volume_cents,
            last_notice=_notice_out(notice),
            created_at=method.created_at,
            updated_at=method.updated_at,
        )
        if _matches_location(row, location_public_id) and _matches_search(row, search):
            rows.append(row)

    summary_rows = rows
    filtered_rows = [row for row in rows if _matches_status(row, status)]
    summary = OwnerPaymentHealthSummaryOut(
        total_cards=len(summary_rows),
        expired_count=sum(1 for row in summary_rows if row.card_status == "expired"),
        expiring_count=sum(1 for row in summary_rows if row.card_status == "expiring"),
        missing_expiry_count=sum(1 for row in summary_rows if row.card_status == "missing_expiry"),
        healthy_count=sum(1 for row in summary_rows if row.card_status == "healthy"),
        affected_member_count=len({row.member_public_id for row in summary_rows if row.member_public_id}),
        notices_sent_count=sum(1 for row in summary_rows if row.last_notice and row.last_notice.status in NOTICE_ATTEMPT_STATUSES),
        upcoming_booking_value_cents=sum(row.upcoming_booking_value_cents for row in summary_rows),
        recent_paid_volume_cents=sum(row.recent_paid_volume_cents for row in summary_rows),
    )
    return OwnerPaymentHealthCardsOut(generated_at=generated_at, summary=summary, results=filtered_rows)


def send_owner_payment_health_card_notices(
    db: Session,
    *,
    user_id: int,
    payment_method_public_ids: list[str],
    organization_public_id: str | None = None,
    force: bool = False,
) -> OwnerPaymentHealthCardNoticeOut:
    orgs = _accessible_orgs(db, user_id, organization_public_id)
    org_by_id = {org.id: org for org in orgs}
    unique_public_ids = list(dict.fromkeys(payment_method_public_ids))
    org_ids = list(org_by_id)
    methods = (
        db.query(MemberOwnerPaymentMethod)
        .filter(
            MemberOwnerPaymentMethod.public_id.in_(unique_public_ids or [""]),
            MemberOwnerPaymentMethod.organization_id.in_(org_ids),
            MemberOwnerPaymentMethod.status.in_(["active", "expiring", "expired"]),
        )
        .all()
    )
    method_by_public_id = {method.public_id: method for method in methods}
    user_ids = {method.user_id for method in methods}
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    results: list[OwnerPaymentHealthCardNoticeResultOut] = []
    today = today_utc_date()
    for public_id in unique_public_ids:
        method = method_by_public_id.get(public_id)
        if not method:
            results.append(
                OwnerPaymentHealthCardNoticeResultOut(
                    payment_method_public_id=public_id,
                    status="skipped",
                    reason="not_found",
                )
            )
            continue
        user = users.get(method.user_id)
        org = org_by_id.get(method.organization_id)
        if not user or not user.email or not org:
            results.append(
                OwnerPaymentHealthCardNoticeResultOut(
                    payment_method_public_id=public_id,
                    member_email=user.email if user else None,
                    status="skipped",
                    reason="missing_email",
                )
            )
            continue
        if not force and card_notice_exists(db, method):
            latest = latest_card_notice(db, method)
            results.append(
                OwnerPaymentHealthCardNoticeResultOut(
                    payment_method_public_id=public_id,
                    member_email=user.email,
                    status="skipped",
                    reason="already_sent",
                    outbound_message_public_id=latest.public_id if latest else None,
                    outbound_status=latest.status if latest else None,
                )
            )
            continue
        card_status = classify_card_status(method.exp_month, method.exp_year, today=today)
        try:
            outbound = send_card_expiring_email(
                db,
                user=user,
                organization=org,
                method=method,
                expired=card_status == "expired",
            )
        except Exception as exc:  # noqa: BLE001 - API should report per-recipient failures.
            results.append(
                OwnerPaymentHealthCardNoticeResultOut(
                    payment_method_public_id=public_id,
                    member_email=user.email,
                    status="failed",
                    reason=str(exc),
                )
            )
            continue
        results.append(
            OwnerPaymentHealthCardNoticeResultOut(
                payment_method_public_id=public_id,
                member_email=user.email,
                status="sent",
                outbound_message_public_id=outbound.public_id if outbound else None,
                outbound_status=outbound.status if outbound else None,
            )
        )

    return OwnerPaymentHealthCardNoticeOut(
        sent_count=sum(1 for row in results if row.status == "sent"),
        skipped_count=sum(1 for row in results if row.status == "skipped"),
        failed_count=sum(1 for row in results if row.status == "failed"),
        results=results,
    )
