from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
import stripe

from app.core.crypto import decrypt_secret
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.services.stripe_webhooks import construct_event
from app.services.stripe_handlers import handle_event
from app.db.deps import get_db

router = APIRouter()


@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    event = construct_event(request, payload, sig_header)

    result = handle_event(db, event)
    return {"received": True, **result}


@router.post("/webhooks/stripe/owner/{payment_setting_public_id}")
async def owner_stripe_webhook(
    payment_setting_public_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.public_id == payment_setting_public_id, OwnerPaymentSetting.provider == "stripe")
        .first()
    )
    if not setting:
        raise HTTPException(status_code=404, detail="Payment setting not found")
    secret = decrypt_secret(setting.stripe_webhook_secret_encrypted)
    if not secret:
        raise HTTPException(status_code=400, detail="Stripe webhook secret not configured")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    event = stripe.Webhook.construct_event(payload=payload, sig_header=sig_header, secret=secret)
    result = handle_event(db, event)
    return {"received": True, **result}
