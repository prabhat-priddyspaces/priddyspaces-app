from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, BookingStatus, PaymentStatus, SpaceType, UserRole
from app.models.location import Location
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.push_subscription import PushSubscription
from app.models.space import Space
from app.models.user import User
from app.models.user_notification import UserNotification, UserNotificationPreference
from app.services.authz import user_can_access_location

try:  # Optional at import time so local tests can run before dependencies are installed.
    from pywebpush import WebPushException, webpush
except Exception:  # pragma: no cover - exercised only when dependency is absent
    WebPushException = Exception
    webpush = None


logger = logging.getLogger("push_notifications")

BOOKING_START = "booking_start"
BOOKING_END = "booking_end"
AUDIENCE_MEMBER = "member"
AUDIENCE_OWNER_TEAM = "owner_team"
REMINDER_LEAD = timedelta(minutes=10)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def endpoint_hash(value: str) -> str:
    raw_key = settings.JWT_SECRET or settings.PAYMENT_CREDENTIAL_ENCRYPTION_KEY or "priddyspaces-local-push-key"
    return hmac.new(raw_key.encode("utf-8"), value.encode("utf-8"), hashlib.sha256).hexdigest()


def ensure_notification_preferences(db: Session, user_id: int) -> UserNotificationPreference:
    prefs = db.query(UserNotificationPreference).filter(UserNotificationPreference.user_id == user_id).first()
    if prefs:
        return prefs
    prefs = UserNotificationPreference(
        user_id=user_id,
        booking_start_push_enabled=True,
        booking_end_push_enabled=True,
    )
    db.add(prefs)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        prefs = db.query(UserNotificationPreference).filter(UserNotificationPreference.user_id == user_id).first()
        if prefs:
            return prefs
        raise
    db.refresh(prefs)
    return prefs


def upsert_push_subscription(
    db: Session,
    *,
    user_id: int,
    provider: str,
    endpoint_or_token: str,
    payload: dict[str, Any],
    user_agent: str | None = None,
    device_name: str | None = None,
    tenant_id: int | None = None,
) -> PushSubscription:
    hashed = endpoint_hash(endpoint_or_token)
    encrypted = encrypt_secret(json.dumps(payload, separators=(",", ":"), sort_keys=True))
    subscription = db.query(PushSubscription).filter(PushSubscription.endpoint_hash == hashed).first()
    if subscription:
        subscription.user_id = user_id
        subscription.tenant_id = tenant_id
        subscription.provider = provider
        subscription.subscription_encrypted = encrypted or ""
        subscription.user_agent = user_agent
        subscription.device_name = device_name
        subscription.is_active = True
        subscription.last_error = None
        subscription.deactivated_at = None
    else:
        subscription = PushSubscription(
            user_id=user_id,
            tenant_id=tenant_id,
            provider=provider,
            endpoint_hash=hashed,
            subscription_encrypted=encrypted or "",
            user_agent=user_agent,
            device_name=device_name,
            is_active=True,
        )
        db.add(subscription)
    db.commit()
    db.refresh(subscription)
    return subscription


def deactivate_push_subscription(db: Session, subscription: PushSubscription, error: str | None = None) -> None:
    subscription.is_active = False
    subscription.deactivated_at = now_utc()
    subscription.last_error = error
    db.add(subscription)
    db.commit()


def _subscription_payload(subscription: PushSubscription) -> dict[str, Any]:
    raw = decrypt_secret(subscription.subscription_encrypted)
    if not raw:
        return {}
    return json.loads(raw)


def _send_web_push(subscription: PushSubscription, payload: dict[str, Any]) -> tuple[bool, str | None, bool]:
    if not settings.WEB_PUSH_VAPID_PUBLIC_KEY or not settings.WEB_PUSH_VAPID_PRIVATE_KEY:
        return False, "Web push VAPID keys are not configured", False
    if webpush is None:
        return False, "pywebpush is not installed", False
    try:
        webpush(
            subscription_info=_subscription_payload(subscription),
            data=json.dumps(payload),
            vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.WEB_PUSH_VAPID_SUBJECT},
        )
        return True, None, False
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        return False, str(exc), status_code in {404, 410}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Web push failed")
        return False, str(exc), False


def _send_expo_push(subscription: PushSubscription, payload: dict[str, Any]) -> tuple[bool, str | None, bool]:
    token = _subscription_payload(subscription).get("token")
    if not token:
        return False, "Expo token is missing", True
    headers = {"Content-Type": "application/json"}
    if settings.EXPO_PUSH_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {settings.EXPO_PUSH_ACCESS_TOKEN}"
    try:
        response = httpx.post(
            "https://exp.host/--/api/v2/push/send",
            headers=headers,
            json={
                "to": token,
                "title": payload["title"],
                "body": payload["body"],
                "data": payload.get("data") or {},
                "sound": "default",
            },
            timeout=10.0,
        )
        if response.status_code >= 400:
            return False, response.text[:1000], response.status_code in {400, 404, 410}
        data = response.json()
        item = data.get("data") if isinstance(data, dict) else None
        if isinstance(item, dict) and item.get("status") == "error":
            details = item.get("details") or {}
            error = item.get("message") or item.get("status")
            return False, str(error), details.get("error") == "DeviceNotRegistered"
        return True, None, False
    except Exception as exc:  # noqa: BLE001
        logger.exception("Expo push failed")
        return False, str(exc), False


def send_push_to_user(
    db: Session,
    *,
    user_id: int,
    title: str,
    body: str,
    data: dict[str, Any],
) -> tuple[str, str | None]:
    subscriptions = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == user_id, PushSubscription.is_active.is_(True))
        .all()
    )
    if not subscriptions:
        return "skipped", "No active push subscription"

    sent = 0
    errors: list[str] = []
    payload = {"title": title, "body": body, "data": data}
    for subscription in subscriptions:
        if subscription.provider == "web":
            ok, error, deactivate = _send_web_push(subscription, payload)
        elif subscription.provider == "expo":
            ok, error, deactivate = _send_expo_push(subscription, payload)
        else:
            ok, error, deactivate = False, f"Unsupported push provider: {subscription.provider}", True

        subscription.last_used_at = now_utc()
        subscription.last_error = error
        if deactivate:
            subscription.is_active = False
            subscription.deactivated_at = now_utc()
        db.add(subscription)
        if ok:
            sent += 1
        elif error:
            errors.append(error)
    db.commit()

    if sent > 0:
        return "sent", None
    return "failed", "; ".join(errors)[:1024] if errors else "Push delivery failed"


def _booking_payment_invalid(db: Session, booking: Booking, req: BookingRequest | None) -> bool:
    if req and req.status == BookingRequestStatus.PAYMENT_FAILED:
        return True
    if req and (req.payment_status or "").lower() in {"failed", "refunded", "voided"}:
        return True
    payment_query = db.query(Payment)
    if req:
        payment_query = payment_query.filter(or_(Payment.booking_id == booking.id, Payment.booking_request_id == req.id))
    else:
        payment_query = payment_query.filter(Payment.booking_id == booking.id)
    latest_payment = payment_query.order_by(Payment.created_at.desc(), Payment.id.desc()).first()
    if not latest_payment:
        return False
    return latest_payment.status in {PaymentStatus.FAILED, PaymentStatus.REFUNDED, PaymentStatus.VOIDED}


def _booking_context(db: Session, booking: Booking) -> tuple[Space | None, Location | None, BookingRequest | None]:
    space = db.query(Space).filter(Space.id == booking.space_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    req = None
    if booking.booking_request_id:
        req = db.query(BookingRequest).filter(BookingRequest.id == booking.booking_request_id).first()
    if not req:
        req = db.query(BookingRequest).filter(BookingRequest.booking_id == booking.id).first()
    return space, location, req


def _space_name(space: Space | None) -> str:
    if not space:
        return "Workspace"
    return space.name or str(getattr(space.space_type, "value", space.space_type)).replace("_", " ").title()


def _notification_copy(
    *,
    reminder_type: str,
    audience: str,
    booking: Booking,
    space: Space | None,
    location: Location | None,
) -> tuple[str, str, str]:
    space_name = _space_name(space)
    location_name = location.name if location else "your location"
    if reminder_type == BOOKING_END:
        title = "Booking ending soon"
        body = f"{space_name} at {location_name} ends in 10 minutes."
    elif audience == AUDIENCE_OWNER_TEAM:
        title = "Upcoming booking"
        body = f"{space_name} at {location_name} starts in 10 minutes."
    else:
        title = "Your booking starts soon"
        body = f"{space_name} at {location_name} starts in 10 minutes."
    if audience == AUDIENCE_OWNER_TEAM:
        return title, body, f"/owner/calendar?booking={booking.public_id}"
    return title, body, f"/member/requests/{booking.public_id}"


def _create_user_notification(
    db: Session,
    *,
    user_id: int,
    audience: str,
    reminder_type: str,
    booking: Booking,
    req: BookingRequest | None,
    space: Space | None,
    location: Location | None,
) -> tuple[UserNotification | None, bool]:
    title, body, link_url = _notification_copy(
        reminder_type=reminder_type,
        audience=audience,
        booking=booking,
        space=space,
        location=location,
    )
    notification = UserNotification(
        user_id=user_id,
        tenant_id=booking.tenant_id,
        organization_id=location.organization_id if location else booking.tenant_id,
        booking_id=booking.id,
        booking_request_id=req.id if req else None,
        location_id=location.id if location else None,
        space_id=space.id if space else booking.space_id,
        audience=audience,
        reminder_type=reminder_type,
        title=title,
        body=body,
        link_url=link_url,
    )
    db.add(notification)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None, True
    db.refresh(notification)
    return notification, False


def _owner_recipients_for_reminder(
    db: Session,
    *,
    location: Location,
    reminder_type: str,
) -> list[OrganizationMember]:
    roles = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
    query = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.role.in_(roles),
        )
    )
    if reminder_type == BOOKING_END:
        query = query.filter(OrganizationMember.receives_booking_end_push.is_(True))
    else:
        query = query.filter(OrganizationMember.receives_booking_start_push.is_(True))
    members = query.all()
    return [
        member
        for member in members
        if user_can_access_location(db, member.user_id, location, roles)
    ]


def _send_notification_push(db: Session, notification: UserNotification, booking: Booking) -> None:
    status, error = send_push_to_user(
        db,
        user_id=notification.user_id,
        title=notification.title,
        body=notification.body,
        data={
            "notification_public_id": notification.public_id,
            "booking_public_id": booking.public_id,
            "audience": notification.audience,
            "reminder_type": notification.reminder_type,
            "link_url": notification.link_url,
        },
    )
    notification.push_status = status
    notification.push_error = error
    notification.push_attempted_at = now_utc()
    notification.delivered_at = now_utc() if status == "sent" else None
    db.add(notification)
    db.commit()


def _process_recipient(
    db: Session,
    *,
    user_id: int,
    audience: str,
    reminder_type: str,
    booking: Booking,
    req: BookingRequest | None,
    space: Space | None,
    location: Location | None,
) -> str:
    notification, duplicate = _create_user_notification(
        db,
        user_id=user_id,
        audience=audience,
        reminder_type=reminder_type,
        booking=booking,
        req=req,
        space=space,
        location=location,
    )
    if duplicate:
        return "duplicate"
    if not notification:
        return "skipped"
    _send_notification_push(db, notification, booking)
    return "sent" if notification.push_status == "sent" else "created"


def _member_enabled(db: Session, user_id: int, reminder_type: str) -> bool:
    prefs = ensure_notification_preferences(db, user_id)
    if reminder_type == BOOKING_END:
        return prefs.booking_end_push_enabled
    return prefs.booking_start_push_enabled


def _due_booking_query(db: Session, *, now: datetime, reminder_type: str, limit: int):
    if reminder_type == BOOKING_END:
        target_col = Booking.end_datetime
    else:
        target_col = Booking.start_datetime
    return (
        db.query(Booking)
        .filter(
            Booking.status == BookingStatus.CONFIRMED,
            target_col > now,
            target_col <= now + REMINDER_LEAD,
        )
        .order_by(target_col.asc(), Booking.id.asc())
        .limit(limit)
        .all()
    )


def run_booking_reminder_push_job(
    db: Session,
    *,
    now: datetime | None = None,
    limit: int = 100,
) -> dict[str, int]:
    current = as_utc(now or now_utc())
    result = {
        "bookings_found": 0,
        "notifications_created": 0,
        "notifications_sent": 0,
        "notifications_duplicate": 0,
        "notifications_skipped": 0,
    }

    due: list[tuple[Booking, str]] = []
    for reminder_type in [BOOKING_START, BOOKING_END]:
        due.extend((booking, reminder_type) for booking in _due_booking_query(db, now=current, reminder_type=reminder_type, limit=limit))
    result["bookings_found"] = len(due)

    for booking, reminder_type in due[:limit]:
        space, location, req = _booking_context(db, booking)
        if not space or not location:
            result["notifications_skipped"] += 1
            continue
        if reminder_type == BOOKING_END and space.space_type != SpaceType.CONFERENCE_ROOM:
            continue
        if _booking_payment_invalid(db, booking, req):
            result["notifications_skipped"] += 1
            continue

        if booking.user_id and _member_enabled(db, booking.user_id, reminder_type):
            status = _process_recipient(
                db,
                user_id=booking.user_id,
                audience=AUDIENCE_MEMBER,
                reminder_type=reminder_type,
                booking=booking,
                req=req,
                space=space,
                location=location,
            )
            if status == "duplicate":
                result["notifications_duplicate"] += 1
            elif status == "sent":
                result["notifications_sent"] += 1
                result["notifications_created"] += 1
            elif status == "created":
                result["notifications_created"] += 1
            else:
                result["notifications_skipped"] += 1
        else:
            result["notifications_skipped"] += 1

        seen_owner_users: set[int] = set()
        for org_member in _owner_recipients_for_reminder(db, location=location, reminder_type=reminder_type):
            if org_member.user_id in seen_owner_users:
                continue
            seen_owner_users.add(org_member.user_id)
            status = _process_recipient(
                db,
                user_id=org_member.user_id,
                audience=AUDIENCE_OWNER_TEAM,
                reminder_type=reminder_type,
                booking=booking,
                req=req,
                space=space,
                location=location,
            )
            if status == "duplicate":
                result["notifications_duplicate"] += 1
            elif status == "sent":
                result["notifications_sent"] += 1
                result["notifications_created"] += 1
            elif status == "created":
                result["notifications_created"] += 1
            else:
                result["notifications_skipped"] += 1

    return result
