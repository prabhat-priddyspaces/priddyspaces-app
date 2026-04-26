import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("notifications")


def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.SENDGRID_API_KEY or not settings.SENDGRID_FROM_EMAIL:
        logger.info("send_email skipped (not configured) to=%s subject=%s", to_email, subject)
        return

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": settings.SENDGRID_FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/plain", "value": body}],
    }

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
