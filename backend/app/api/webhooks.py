from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

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
