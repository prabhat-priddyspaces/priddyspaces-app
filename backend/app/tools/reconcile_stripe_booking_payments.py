from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_secret
from app.db.session import SessionLocal
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, PaymentStatus
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.services.booking_payments import finalize_successful_booking_request_payment
from app.services.payment_providers import stripe_object_to_dict

logger = logging.getLogger(__name__)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _intent_created_at(intent: dict[str, Any]) -> datetime | None:
    created = intent.get("created")
    if created in (None, ""):
        return None
    return datetime.fromtimestamp(int(created), tz=timezone.utc)


def _latest_payment_for_request(db: Session, req: BookingRequest) -> Payment | None:
    return (
        db.query(Payment)
        .filter(Payment.booking_request_id == req.id)
        .order_by(Payment.created_at.desc(), Payment.id.desc())
        .first()
    )


def _failed_booking_requests(
    db: Session,
    *,
    request_public_id: str | None = None,
    since_days: int = 7,
) -> list[BookingRequest]:
    query = db.query(BookingRequest).filter(
        BookingRequest.status == BookingRequestStatus.PAYMENT_FAILED,
    )
    query = query.outerjoin(OwnerPaymentSetting, BookingRequest.owner_payment_setting_id == OwnerPaymentSetting.id).filter(
        or_(BookingRequest.payment_provider == "stripe", OwnerPaymentSetting.provider == "stripe")
    )
    if request_public_id:
        query = query.filter(BookingRequest.public_id == request_public_id)
    else:
        since = datetime.now(timezone.utc) - timedelta(days=max(1, since_days))
        query = query.filter(BookingRequest.created_at >= since)
    return query.order_by(BookingRequest.created_at.asc(), BookingRequest.id.asc()).all()


def _setting_and_method(
    db: Session,
    req: BookingRequest,
) -> tuple[OwnerPaymentSetting | None, MemberOwnerPaymentMethod | None]:
    setting = (
        db.query(OwnerPaymentSetting)
        .filter(OwnerPaymentSetting.id == req.owner_payment_setting_id, OwnerPaymentSetting.provider == "stripe")
        .first()
        if req.owner_payment_setting_id
        else None
    )
    method = (
        db.query(MemberOwnerPaymentMethod)
        .filter(MemberOwnerPaymentMethod.id == req.member_owner_payment_method_id)
        .first()
        if req.member_owner_payment_method_id
        else None
    )
    return setting, method


def _request_amount_cents(db: Session, req: BookingRequest) -> int | None:
    payment = _latest_payment_for_request(db, req)
    if payment and payment.amount_cents is not None:
        return int(payment.amount_cents)
    if payment and payment.amount is not None:
        return int(payment.amount) * 100
    return None


def _intent_matches_request(
    intent: dict[str, Any],
    *,
    req: BookingRequest,
    method: MemberOwnerPaymentMethod | None,
    amount_cents: int | None,
    since: datetime,
) -> bool:
    if intent.get("status") != "succeeded":
        return False
    metadata = intent.get("metadata") if isinstance(intent.get("metadata"), dict) else {}
    if metadata.get("booking_request_public_id") == req.public_id:
        return True
    if amount_cents is not None and int(intent.get("amount") or 0) != amount_cents:
        return False
    if method and method.provider_customer_id and intent.get("customer") != method.provider_customer_id:
        return False
    created_at = _intent_created_at(intent)
    return created_at is not None and created_at >= since


def _stripe_intents_for_request(
    *,
    secret_key: str,
    req: BookingRequest,
    method: MemberOwnerPaymentMethod | None,
    since: datetime,
) -> list[dict[str, Any]]:
    intents: list[dict[str, Any]] = []
    query = f"metadata['booking_request_public_id']:'{req.public_id}' AND status:'succeeded'"
    try:
        response = stripe.PaymentIntent.search(query=query, limit=10, api_key=secret_key)
        intents.extend(stripe_object_to_dict(item) for item in getattr(response, "data", []) or [])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Stripe search failed for request %s: %s", req.public_id, exc)

    if method and method.provider_customer_id:
        try:
            response = stripe.PaymentIntent.list(
                customer=method.provider_customer_id,
                created={"gte": int(since.timestamp())},
                limit=100,
                api_key=secret_key,
            )
            intents.extend(stripe_object_to_dict(item) for item in getattr(response, "data", []) or [])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Stripe customer intent list failed for request %s: %s", req.public_id, exc)

    deduped: dict[str, dict[str, Any]] = {}
    for intent in intents:
        intent_id = intent.get("id")
        if intent_id:
            deduped[str(intent_id)] = intent
    return list(deduped.values())


def find_succeeded_intent_for_request(db: Session, req: BookingRequest) -> dict[str, Any] | None:
    setting, method = _setting_and_method(db, req)
    if not setting:
        return None
    secret_key = decrypt_secret(setting.stripe_secret_key_encrypted)
    if not secret_key:
        return None
    amount_cents = _request_amount_cents(db, req)
    created_at = _as_utc(req.created_at) or datetime.now(timezone.utc)
    since = created_at - timedelta(minutes=10)
    intents = _stripe_intents_for_request(secret_key=secret_key, req=req, method=method, since=since)
    matches = [
        intent
        for intent in intents
        if _intent_matches_request(intent, req=req, method=method, amount_cents=amount_cents, since=since)
    ]
    matches.sort(key=lambda item: int(item.get("created") or 0), reverse=True)
    return matches[0] if matches else None


def reconcile_failed_request_with_intent(
    db: Session,
    req: BookingRequest,
    intent: dict[str, Any] | None,
    *,
    execute: bool = False,
) -> dict[str, Any]:
    if not intent:
        return {"request_public_id": req.public_id, "action": "no_match"}
    if intent.get("status") != "succeeded":
        return {
            "request_public_id": req.public_id,
            "payment_intent_id": intent.get("id"),
            "action": "skipped",
            "reason": f"Stripe status {intent.get('status')}",
        }
    if not execute:
        return {
            "request_public_id": req.public_id,
            "payment_intent_id": intent.get("id"),
            "action": "would_repair",
        }

    payment = _latest_payment_for_request(db, req)
    if not payment:
        payment = Payment(
            user_id=req.user_id,
            booking_request_id=req.id,
            booking_id=req.booking_id,
            tenant_id=req.tenant_id,
            amount=int(intent.get("amount") or 0) // 100,
            amount_cents=int(intent.get("amount") or 0),
            currency=(intent.get("currency") or "usd")[:3],
            provider="stripe",
            payment_method_id=req.member_owner_payment_method_id,
            status=PaymentStatus.REQUIRES_PAYMENT,
            attempt_number=max(1, req.payment_attempt_count or 1),
        )
        db.add(payment)
        db.flush()
    finalize_successful_booking_request_payment(
        db,
        req=req,
        payment=payment,
        provider_payment_id=intent.get("id"),
        provider_reference_id=intent.get("latest_charge"),
        raw_response=intent,
    )
    return {
        "request_public_id": req.public_id,
        "payment_intent_id": intent.get("id"),
        "action": "repaired",
    }


def reconcile(
    db: Session,
    *,
    request_public_id: str | None = None,
    since_days: int = 7,
    execute: bool = False,
) -> dict[str, Any]:
    rows = _failed_booking_requests(db, request_public_id=request_public_id, since_days=since_days)
    results = []
    for req in rows:
        intent = find_succeeded_intent_for_request(db, req)
        results.append(reconcile_failed_request_with_intent(db, req, intent, execute=execute))
    return {
        "execute": execute,
        "scanned": len(rows),
        "repaired": sum(1 for item in results if item["action"] == "repaired"),
        "would_repair": sum(1 for item in results if item["action"] == "would_repair"),
        "no_match": sum(1 for item in results if item["action"] == "no_match"),
        "results": results,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Reconcile Stripe-successful booking payments marked failed locally.")
    parser.add_argument("--request-public-id", help="Repair one booking request public id.")
    parser.add_argument("--since-days", type=int, default=7, help="Scan failed booking requests created in the last N days.")
    parser.add_argument("--execute", action="store_true", help="Apply repairs. Omit for dry-run output.")
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        result = reconcile(
            db,
            request_public_id=args.request_public_id,
            since_days=args.since_days,
            execute=args.execute,
        )
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
