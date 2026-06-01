from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.schemas.owner_payment_health import (
    OwnerPaymentHealthCardNoticeCreate,
    OwnerPaymentHealthCardNoticeOut,
    OwnerPaymentHealthCardsOut,
)
from app.services.auth_user import get_or_create_user
from app.services.owner_payment_health import (
    DEFAULT_EXPIRING_WINDOW_DAYS,
    owner_payment_health_cards,
    send_owner_payment_health_card_notices,
)

router = APIRouter()


@router.get("/owner/payment-health/cards", response_model=OwnerPaymentHealthCardsOut)
def list_owner_payment_health_cards(
    organization_public_id: str | None = None,
    status: str | None = "at_risk",
    window_days: int = DEFAULT_EXPIRING_WINDOW_DAYS,
    location_public_id: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    return owner_payment_health_cards(
        db,
        user_id=user.id,
        organization_public_id=organization_public_id,
        status=status,
        window_days=window_days,
        location_public_id=location_public_id,
        search=search,
    )


@router.post("/owner/payment-health/card-notices", response_model=OwnerPaymentHealthCardNoticeOut)
def send_owner_payment_health_card_notice(
    payload: OwnerPaymentHealthCardNoticeCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    return send_owner_payment_health_card_notices(
        db,
        user_id=user.id,
        payment_method_public_ids=payload.payment_method_public_ids,
        organization_public_id=payload.organization_public_id,
        force=payload.force,
    )
