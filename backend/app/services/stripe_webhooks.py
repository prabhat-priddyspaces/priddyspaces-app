from typing import Any

import stripe
from fastapi import HTTPException, Request

from app.core.config import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def construct_event(request: Request, payload: bytes, sig_header: str) -> Any:
    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Invalid signature") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid payload") from exc

    return event
