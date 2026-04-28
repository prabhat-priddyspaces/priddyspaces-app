"""Poll CardPointe for settlement status of recently captured payments.

CardPointe's auth+capture flow returns sync approval, but settlement happens
asynchronously (typically T+1 business day). This service queries the `inquire`
endpoint to update the cached `raw_response` so dashboards reflect settlement
state. Intended to be run periodically (cron / scheduled job).

Run manually:
    from app.db.session import SessionLocal
    from app.services.cardpointe_settlement_poller import update_pending_cardpointe_settlements
    with SessionLocal() as db:
        result = update_pending_cardpointe_settlements(db)
        print(result)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.enums import PaymentStatus
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.services.payment_providers import (
    CardPointePaymentProvider,
    PaymentProviderError,
)

logger = logging.getLogger(__name__)


def _is_settled(raw: dict[str, Any] | None) -> bool:
    if not raw or not isinstance(raw, dict):
        return False
    setlstat = str(raw.get("setlstat") or "").lower()
    return setlstat in {"settled", "captured", "queued for capture", "queued"}


def update_pending_cardpointe_settlements(
    db: Session,
    *,
    max_age_days: int = 7,
    limit: int = 200,
) -> dict[str, Any]:
    """Inquire each succeeded CardPointe payment without settlement metadata.

    Updates `Payment.raw_response` with the latest status. Does not change
    `Payment.status` (which represents the captured state) — settlement details
    live in the JSON response so analytics and reconciliation can read them.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    payments: list[Payment] = (
        db.query(Payment)
        .filter(
            Payment.provider == "cardpointe",
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.created_at >= cutoff,
        )
        .order_by(Payment.created_at.desc())
        .limit(limit)
        .all()
    )

    polled = 0
    settled = 0
    failed = 0
    for payment in payments:
        if _is_settled(payment.raw_response):
            continue
        retref = payment.provider_reference_id or payment.provider_payment_id
        if not retref:
            continue
        setting = (
            db.query(OwnerPaymentSetting)
            .filter(
                OwnerPaymentSetting.organization_id == payment.tenant_id,
                OwnerPaymentSetting.provider == "cardpointe",
            )
            .first()
        )
        if not setting:
            continue
        try:
            provider = CardPointePaymentProvider(setting)
            result = provider.get_payment_status(retref)
        except PaymentProviderError as exc:
            logger.warning("CardPointe inquire failed for payment %s: %s", payment.public_id, exc)
            failed += 1
            continue
        except Exception as exc:  # network / parse errors — keep going
            logger.warning("CardPointe inquire error for payment %s: %s", payment.public_id, exc)
            failed += 1
            continue
        polled += 1
        merged = dict(payment.raw_response or {})
        if result.raw_response:
            merged.update(result.raw_response)
        payment.raw_response = merged
        if _is_settled(merged):
            settled += 1
        db.add(payment)

    db.commit()
    return {
        "candidates": len(payments),
        "polled": polled,
        "settled_now": settled,
        "failed": failed,
    }
