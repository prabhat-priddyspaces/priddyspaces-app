import logging
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.email_subscription_group import EmailSubscriptionGroup
from app.models.user import User

logger = logging.getLogger("notifications")


def _is_suppressed(db: Session, to_email: str, asm_group_id: Optional[int]) -> bool:
    user = db.query(User).filter(User.email == to_email).first()
    if user and user.email_unsubscribed_at is not None:
        return True
    if asm_group_id is not None:
        group_pref = (
            db.query(EmailSubscriptionGroup)
            .filter(
                EmailSubscriptionGroup.email == to_email,
                EmailSubscriptionGroup.asm_group_id == asm_group_id,
            )
            .first()
        )
        if group_pref and group_pref.status == "unsubscribed":
            return True
    return False


def send_email(
    to_email: str,
    subject: str,
    body: str,
    *,
    db: Optional[Session] = None,
    asm_group_id: Optional[int] = None,
) -> None:
    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        logger.info("send_email skipped (not configured) to=%s subject=%s", to_email, subject)
        return

    if db is not None and _is_suppressed(db, to_email, asm_group_id):
        logger.info(
            "send_email skipped (unsubscribed) to=%s subject=%s asm_group=%s",
            to_email, subject, asm_group_id,
        )
        return

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }
    if asm_group_id is not None:
        payload["asm"] = {"group_id": asm_group_id}

    try:
        resp = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {settings.SENDGRID_API_KEY}"},
            json=payload,
            timeout=10.0
        )
        if resp.status_code >= 400:
            logger.warning("send_email failed status=%s body=%s", resp.status_code, resp.text)
    except Exception as exc:
        logger.exception("send_email exception: %s", exc)
