from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.push_subscription import PushSubscription
from app.models.user_notification import UserNotification
from app.schemas.notifications import (
    NotificationListOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    PushConfigOut,
    PushSubscriptionCreate,
    PushSubscriptionOut,
)
from app.services.auth_user import get_or_create_user
from app.services.push_notifications import ensure_notification_preferences, upsert_push_subscription

router = APIRouter()


@router.get("/push/config", response_model=PushConfigOut)
def push_config():
    public_key = settings.WEB_PUSH_VAPID_PUBLIC_KEY or None
    return PushConfigOut(
        web_push_enabled=bool(public_key and settings.WEB_PUSH_VAPID_PRIVATE_KEY),
        web_push_public_key=public_key,
        expo_push_enabled=True,
    )


@router.post("/push-subscriptions", response_model=PushSubscriptionOut)
def create_push_subscription(
    payload: PushSubscriptionCreate,
    request: Request,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if payload.provider == "web":
        raw_payload = payload.subscription or {}
        endpoint_or_token = str(raw_payload.get("endpoint") or "")
    else:
        endpoint_or_token = str(payload.token or "")
        raw_payload = {"token": endpoint_or_token}
    subscription = upsert_push_subscription(
        db,
        user_id=user.id,
        provider=payload.provider,
        endpoint_or_token=endpoint_or_token,
        payload=raw_payload,
        user_agent=payload.user_agent or request.headers.get("user-agent"),
        device_name=payload.device_name,
    )
    return subscription


@router.delete("/push-subscriptions/{public_id}")
def delete_push_subscription(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    subscription = (
        db.query(PushSubscription)
        .filter(PushSubscription.public_id == public_id, PushSubscription.user_id == user.id)
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="Push subscription not found")
    subscription.is_active = False
    subscription.deactivated_at = datetime.now(timezone.utc)
    db.add(subscription)
    db.commit()
    return {"status": "ok"}


@router.get("/notifications", response_model=NotificationListOut)
def list_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    query = db.query(UserNotification).filter(UserNotification.user_id == user.id)
    if unread_only:
        query = query.filter(UserNotification.is_read.is_(False))
    total = query.count()
    unread_count = (
        db.query(UserNotification)
        .filter(UserNotification.user_id == user.id, UserNotification.is_read.is_(False))
        .count()
    )
    rows = (
        query.order_by(UserNotification.created_at.desc(), UserNotification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return NotificationListOut(
        results=rows,
        total=total,
        unread_count=unread_count,
        page=page,
        page_size=page_size,
    )


@router.patch("/notifications/{public_id}/read")
def mark_notification_read(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    notification = (
        db.query(UserNotification)
        .filter(UserNotification.public_id == public_id, UserNotification.user_id == user.id)
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    notification.read_at = datetime.now(timezone.utc)
    db.add(notification)
    db.commit()
    return {"status": "ok"}


@router.get("/notifications/preferences", response_model=NotificationPreferenceOut)
def get_notification_preferences(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    return ensure_notification_preferences(db, user.id)


@router.patch("/notifications/preferences", response_model=NotificationPreferenceOut)
def update_notification_preferences(
    payload: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    prefs = ensure_notification_preferences(db, user.id)
    if payload.booking_start_push_enabled is not None:
        prefs.booking_start_push_enabled = payload.booking_start_push_enabled
    if payload.booking_end_push_enabled is not None:
        prefs.booking_end_push_enabled = payload.booking_end_push_enabled
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs
