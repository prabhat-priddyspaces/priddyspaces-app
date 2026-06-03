from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_promotion import BookingPromotion
from app.models.booking_request import BookingRequest
from app.models.promo_code import PromoCode
from app.models.space import Space


@dataclass(frozen=True)
class PromoApplication:
    promo: PromoCode
    discount_amount_cents: int
    subtotal_before_promo_cents: int
    subtotal_after_promo_cents: int
    snapshot: dict[str, Any]


def normalize_promo_code(code: str | None) -> str:
    return (code or "").strip().upper()


def promo_expiration(promo: PromoCode) -> datetime | None:
    return promo.expires_at or promo.ends_at


def promo_status(promo: PromoCode, *, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    if not promo.is_active:
        return "inactive"
    expires_at = promo_expiration(promo)
    if expires_at and _as_utc(expires_at) <= now:
        return "expired"
    return "active"


def payment_description_from_snapshot(snapshot: dict | None, *, base: str) -> str:
    promo = snapshot.get("promo") if isinstance(snapshot, dict) else None
    code = promo.get("code") if isinstance(promo, dict) else None
    if code:
        return f"{base} - Promo {code}"
    return base


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _member_redemption_count(db: Session, *, promo_code_id: int, user_id: int) -> int:
    return (
        db.query(BookingPromotion)
        .join(BookingRequest, BookingRequest.id == BookingPromotion.booking_request_id)
        .filter(
            BookingPromotion.promo_code_id == promo_code_id,
            BookingRequest.user_id == user_id,
        )
        .count()
    )


def _promo_query(db: Session, *, code: str, tenant_id: int, lock: bool = False):
    query = db.query(PromoCode).filter(PromoCode.tenant_id == tenant_id, PromoCode.code == code)
    if lock:
        query = query.with_for_update()
    return query


def _find_promo_for_space(db: Session, *, space: Space, code: str, lock: bool = False) -> PromoCode:
    promo = _promo_query(db, code=code, tenant_id=space.tenant_id, lock=lock).first()
    if promo:
        return promo
    exists_elsewhere = db.query(PromoCode.id).filter(PromoCode.code == code).first()
    if exists_elsewhere:
        raise HTTPException(status_code=400, detail="Promo code not valid for this booking")
    raise HTTPException(status_code=400, detail="Invalid promo code")


def _discount_amount_cents(promo: PromoCode, subtotal_cents: int) -> int:
    subtotal_cents = max(0, int(subtotal_cents or 0))
    if subtotal_cents <= 0:
        return 0
    if promo.discount_type == "percent":
        discount = int(round(subtotal_cents * (promo.discount_value / 100.0)))
    elif promo.discount_type == "fixed":
        discount = int(promo.discount_value) * 100
    else:
        raise HTTPException(status_code=400, detail="Invalid promo code")
    return max(0, min(subtotal_cents, discount))


def validate_promo_for_space(
    db: Session,
    *,
    space: Space,
    code: str | None,
    subtotal_cents: int,
    user_id: int | None,
    now: datetime | None = None,
    lock: bool = False,
) -> PromoApplication:
    normalized = normalize_promo_code(code)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid promo code")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Sign in to apply promo code")

    now = now or datetime.now(timezone.utc)
    promo = _find_promo_for_space(db, space=space, code=normalized, lock=lock)
    if promo.tenant_id != space.tenant_id:
        raise HTTPException(status_code=400, detail="Promo code not valid for this booking")
    if not promo.is_active:
        raise HTTPException(status_code=400, detail="Promo code inactive")
    if promo.starts_at and _as_utc(promo.starts_at) > now:
        raise HTTPException(status_code=400, detail="Promo code not valid for this booking")
    expires_at = promo_expiration(promo)
    if expires_at and _as_utc(expires_at) <= now:
        raise HTTPException(status_code=400, detail="Promo code expired")
    if promo.max_redemptions is not None and (promo.total_redemptions or 0) >= promo.max_redemptions:
        raise HTTPException(status_code=400, detail="Redemption limit reached")
    if promo.max_redemptions_per_member is not None:
        used_by_member = _member_redemption_count(db, promo_code_id=promo.id, user_id=user_id)
        if used_by_member >= promo.max_redemptions_per_member:
            raise HTTPException(status_code=400, detail="Member redemption limit reached")

    discount_amount = _discount_amount_cents(promo, subtotal_cents)
    snapshot = {
        "promo_code_public_id": promo.public_id,
        "code": promo.code,
        "description": promo.description,
        "discount_type": promo.discount_type,
        "discount_value": promo.discount_value,
        "discount_amount_cents": discount_amount,
        "subtotal_before_promo_cents": max(0, int(subtotal_cents or 0)),
        "subtotal_after_promo_cents": max(0, int(subtotal_cents or 0) - discount_amount),
        "expires_at": expires_at.isoformat() if expires_at else None,
    }
    return PromoApplication(
        promo=promo,
        discount_amount_cents=discount_amount,
        subtotal_before_promo_cents=snapshot["subtotal_before_promo_cents"],
        subtotal_after_promo_cents=snapshot["subtotal_after_promo_cents"],
        snapshot=snapshot,
    )


def apply_promo_to_snapshot(
    db: Session,
    *,
    space: Space,
    snapshot: dict[str, Any],
    promo_code: str | None,
    user_id: int | None,
    tax_rate_percent: float | None,
    lock: bool = False,
) -> dict[str, Any]:
    if not promo_code:
        return snapshot

    original_subtotal = int(snapshot.get("original_subtotal_cents") or snapshot.get("subtotal_cents") or 0)
    volume_discount_cents = int(snapshot.get("volume_discount_cents", snapshot.get("discount_cents") or 0))
    discountable_subtotal = max(0, original_subtotal + volume_discount_cents)
    application = validate_promo_for_space(
        db,
        space=space,
        code=promo_code,
        subtotal_cents=discountable_subtotal,
        user_id=user_id,
        lock=lock,
    )
    promo_discount = application.discount_amount_cents
    subtotal_after_promo = application.subtotal_after_promo_cents
    tax_cents = int(round(subtotal_after_promo * ((tax_rate_percent or 0) / 100.0))) if tax_rate_percent else 0

    updated = {
        **snapshot,
        "original_subtotal_cents": original_subtotal,
        "volume_discount_cents": volume_discount_cents,
        "discount_cents": volume_discount_cents - promo_discount,
        "promo_code": application.snapshot["code"],
        "promo_code_public_id": application.snapshot["promo_code_public_id"],
        "promo_description": application.snapshot["description"],
        "promo_discount_amount_cents": promo_discount,
        "subtotal_after_promo_cents": subtotal_after_promo,
        "tax_cents": tax_cents,
        "total_cents": subtotal_after_promo + tax_cents,
        "promo": application.snapshot,
    }
    return updated


def revalidate_promo_snapshot(
    db: Session,
    *,
    req: BookingRequest,
    space: Space,
    snapshot: dict[str, Any],
    lock: bool = False,
) -> dict[str, Any]:
    promo_code = snapshot.get("promo_code") or (snapshot.get("promo") or {}).get("code")
    if not promo_code:
        return snapshot
    tax_rate_percent = snapshot.get("tax_rate_percent")
    subtotal_after_promo = snapshot.get("subtotal_after_promo_cents")
    tax_cents = snapshot.get("tax_cents")
    if tax_rate_percent is None and subtotal_after_promo:
        try:
            tax_rate_percent = (int(tax_cents or 0) / int(subtotal_after_promo)) * 100
        except (TypeError, ValueError, ZeroDivisionError):
            tax_rate_percent = None
    return apply_promo_to_snapshot(
        db,
        space=space,
        snapshot=snapshot,
        promo_code=str(promo_code),
        user_id=req.user_id,
        tax_rate_percent=tax_rate_percent,
        lock=lock,
    )


def snapshot_from_request(req: BookingRequest) -> dict[str, Any] | None:
    if not req.pricing_snapshot:
        return None
    try:
        parsed = json.loads(req.pricing_snapshot)
    except (TypeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def record_promo_redemption(
    db: Session,
    *,
    req: BookingRequest,
    booking: Booking,
    snapshot: dict[str, Any] | None = None,
) -> BookingPromotion | None:
    snapshot = snapshot or snapshot_from_request(req)
    promo_snapshot = snapshot.get("promo") if isinstance(snapshot, dict) else None
    if not isinstance(promo_snapshot, dict) or not promo_snapshot.get("code"):
        return None

    existing = (
        db.query(BookingPromotion)
        .filter(BookingPromotion.booking_request_id == req.id)
        .first()
    )
    if existing:
        if booking and existing.booking_id != booking.id:
            existing.booking_id = booking.id
            db.add(existing)
        return existing

    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    original_subtotal = int(snapshot.get("original_subtotal_cents") or snapshot.get("subtotal_cents") or 0)
    volume_discount_cents = int(snapshot.get("volume_discount_cents", 0))
    discountable_subtotal = max(0, original_subtotal + volume_discount_cents)
    application = validate_promo_for_space(
        db,
        space=space,
        code=str(promo_snapshot["code"]),
        subtotal_cents=discountable_subtotal,
        user_id=req.user_id,
        lock=True,
    )
    promo = application.promo
    promo.total_redemptions = (promo.total_redemptions or 0) + 1
    db.add(promo)

    stored_snapshot = {
        **promo_snapshot,
        "discount_amount_cents": application.discount_amount_cents,
        "subtotal_before_promo_cents": application.subtotal_before_promo_cents,
        "subtotal_after_promo_cents": application.subtotal_after_promo_cents,
    }
    row = BookingPromotion(
        booking_id=booking.id if booking else None,
        booking_request_id=req.id,
        promo_code_id=promo.id,
        promo_code_snapshot=stored_snapshot,
        discount_amount=application.discount_amount_cents,
    )
    db.add(row)
    return row
