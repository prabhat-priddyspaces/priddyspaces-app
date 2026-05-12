from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import floor
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import PaymentStatus, SpaceType
from app.models.location import Location
from app.models.loyalty import (
    LoyaltyCampaign,
    LoyaltyLedgerEntry,
    LoyaltyOwnerSetting,
    LoyaltyRedemption,
    LoyaltyRedemptionLock,
    LoyaltyWallet,
)
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.space_volume_discount import SpaceVolumeDiscount
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.services.org_member_stats import interacted_user_ids
from app.services.pricing import VolumeDiscount, estimate_booking_price

POINT_VALUE_CENTS_MIN = 1
POINT_VALUE_CENTS_MAX = 10
EARN_RATE_BPS_MIN = 0
EARN_RATE_BPS_MAX = 2000
MAX_REDEMPTION_PERCENT_MAX = 50
PROMO_GRANT_MAX_POINTS = 1_000_000
LOCK_TTL_MINUTES = 30
REDEEMABLE_SPACE_TYPES = {SpaceType.CONFERENCE_ROOM, SpaceType.SHARED_DESK, SpaceType.VIRTUAL_OFFICE}


@dataclass(frozen=True)
class RedemptionPreview:
    eligible: bool
    reason: str | None
    organization: Organization | None
    wallet: LoyaltyWallet | None
    settings: LoyaltyOwnerSetting | None
    subtotal_cents: int
    max_redeemable_points: int
    max_discount_cents: int
    requested_points: int
    discount_cents: int


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def is_active_window(row: LoyaltyCampaign, at: datetime | None = None) -> bool:
    at = at or now_utc()
    start = as_utc(row.starts_at)
    end = as_utc(row.ends_at)
    return (start is None or start <= at) and (end is None or end >= at)


def tier_for_lifetime(points: int) -> str:
    if points >= 150_000:
        return "Platinum"
    if points >= 50_000:
        return "Gold"
    if points >= 10_000:
        return "Silver"
    return "Bronze"


def earn_points_per_dollar(settings: LoyaltyOwnerSetting) -> float:
    if settings.point_value_cents <= 0:
        return 0.0
    return round(settings.earn_rate_bps / (100 * settings.point_value_cents), 4)


def get_settings(db: Session, organization_id: int, *, create: bool = True, actor_id: int | None = None) -> LoyaltyOwnerSetting | None:
    setting = (
        db.query(LoyaltyOwnerSetting)
        .filter(LoyaltyOwnerSetting.organization_id == organization_id)
        .first()
    )
    if setting or not create:
        return setting
    setting = LoyaltyOwnerSetting(
        organization_id=organization_id,
        tenant_id=organization_id,
        updated_by_user_id=actor_id,
    )
    db.add(setting)
    db.flush()
    return setting


def validate_settings(setting: LoyaltyOwnerSetting) -> None:
    if not POINT_VALUE_CENTS_MIN <= setting.point_value_cents <= POINT_VALUE_CENTS_MAX:
        raise HTTPException(status_code=400, detail="Point value is outside platform guardrails")
    if not EARN_RATE_BPS_MIN <= setting.earn_rate_bps <= EARN_RATE_BPS_MAX:
        raise HTTPException(status_code=400, detail="Earn rate is outside platform guardrails")
    if not 0 <= setting.max_redemption_percent <= MAX_REDEMPTION_PERCENT_MAX:
        raise HTTPException(status_code=400, detail="Redemption cap is outside platform guardrails")
    if setting.max_promo_grant_points > PROMO_GRANT_MAX_POINTS:
        raise HTTPException(status_code=400, detail="Promo grant cap is outside platform guardrails")


def get_wallet(db: Session, organization_id: int, user_id: int) -> LoyaltyWallet | None:
    return (
        db.query(LoyaltyWallet)
        .filter(LoyaltyWallet.organization_id == organization_id, LoyaltyWallet.user_id == user_id)
        .first()
    )


def get_or_create_wallet(
    db: Session,
    organization: Organization,
    user: User,
    *,
    grant_signup: bool = True,
) -> LoyaltyWallet:
    wallet = get_wallet(db, organization.id, user.id)
    if wallet:
        return wallet
    wallet = LoyaltyWallet(
        organization_id=organization.id,
        tenant_id=organization.id,
        user_id=user.id,
    )
    db.add(wallet)
    db.flush()
    if grant_signup and user.email_verified:
        grant_signup_campaigns(db, organization, user, wallet)
    return wallet


def _point_type_delta(wallet: LoyaltyWallet, point_type: str, points: int) -> None:
    if point_type == "promo":
        wallet.promo_balance += points
        if wallet.promo_balance < 0:
            raise HTTPException(status_code=400, detail="Insufficient promo points")
    elif point_type == "earned":
        wallet.earned_balance += points
        if wallet.earned_balance < 0:
            raise HTTPException(status_code=400, detail="Insufficient earned points")
        if points > 0:
            wallet.lifetime_earned_points += points
            wallet.tier = tier_for_lifetime(wallet.lifetime_earned_points)
    else:
        raise HTTPException(status_code=400, detail="Unsupported point type")
    db_wallet_tier = tier_for_lifetime(wallet.lifetime_earned_points)
    if wallet.tier != db_wallet_tier:
        wallet.tier = db_wallet_tier


def write_ledger_entry(
    db: Session,
    wallet: LoyaltyWallet,
    *,
    entry_type: str,
    point_type: str,
    points: int,
    source: str,
    source_public_id: str | None = None,
    campaign_id: int | None = None,
    booking_request_id: int | None = None,
    booking_id: int | None = None,
    payment_id: int | None = None,
    redemption_id: int | None = None,
    redemption_lock_id: int | None = None,
    expires_at: datetime | None = None,
    idempotency_key: str | None = None,
    note: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> LoyaltyLedgerEntry:
    if idempotency_key:
        existing = (
            db.query(LoyaltyLedgerEntry)
            .filter(LoyaltyLedgerEntry.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return existing
    if points == 0:
        raise HTTPException(status_code=400, detail="Point ledger entries cannot be zero")

    _point_type_delta(wallet, point_type, points)
    entry = LoyaltyLedgerEntry(
        organization_id=wallet.organization_id,
        tenant_id=wallet.tenant_id,
        wallet_id=wallet.id,
        user_id=wallet.user_id,
        entry_type=entry_type,
        point_type=point_type,
        points=points,
        source=source,
        source_public_id=source_public_id,
        campaign_id=campaign_id,
        booking_request_id=booking_request_id,
        booking_id=booking_id,
        payment_id=payment_id,
        redemption_id=redemption_id,
        redemption_lock_id=redemption_lock_id,
        expires_at=expires_at,
        idempotency_key=idempotency_key,
        note=note,
        metadata_json=metadata_json or {},
    )
    db.add(wallet)
    db.add(entry)
    db.flush()
    return entry


def active_campaigns(db: Session, organization_id: int, campaign_type: str | None = None) -> list[LoyaltyCampaign]:
    query = db.query(LoyaltyCampaign).filter(
        LoyaltyCampaign.organization_id == organization_id,
        LoyaltyCampaign.status == "active",
    )
    if campaign_type:
        query = query.filter(LoyaltyCampaign.campaign_type == campaign_type)
    return [campaign for campaign in query.all() if is_active_window(campaign)]


def _campaign_points(campaign: LoyaltyCampaign, settings: LoyaltyOwnerSetting) -> tuple[str, int]:
    reward = campaign.reward_json or {}
    point_type = str(reward.get("point_type") or "promo")
    if point_type not in {"promo", "earned"}:
        raise HTTPException(status_code=400, detail="Campaign reward point type is invalid")
    points = int(reward.get("points") or 0)
    if points <= 0:
        return point_type, 0
    if point_type == "promo" and points > settings.max_promo_grant_points:
        raise HTTPException(status_code=400, detail="Campaign reward exceeds promo grant guardrail")
    return point_type, points


def _campaign_has_budget(campaign: LoyaltyCampaign, points: int) -> bool:
    if campaign.budget_points is None:
        return True
    return (campaign.issued_points or 0) + points <= campaign.budget_points


def _campaign_daily_cap_remaining(db: Session, organization_id: int, settings: LoyaltyOwnerSetting) -> int:
    start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    issued = (
        db.query(func.coalesce(func.sum(LoyaltyLedgerEntry.points), 0))
        .filter(
            LoyaltyLedgerEntry.organization_id == organization_id,
            LoyaltyLedgerEntry.campaign_id.is_not(None),
            LoyaltyLedgerEntry.points > 0,
            LoyaltyLedgerEntry.created_at >= start,
        )
        .scalar()
        or 0
    )
    return max(0, (settings.campaign_daily_issue_cap or 0) - int(issued))


def grant_campaign_points(
    db: Session,
    organization: Organization,
    user: User,
    wallet: LoyaltyWallet,
    campaign: LoyaltyCampaign,
    *,
    source: str,
    payment_id: int | None = None,
    booking_id: int | None = None,
    booking_request_id: int | None = None,
) -> None:
    settings = get_settings(db, organization.id)
    if settings is None or not settings.is_enabled:
        return
    point_type, points = _campaign_points(campaign, settings)
    if points <= 0 or not _campaign_has_budget(campaign, points):
        return
    if _campaign_daily_cap_remaining(db, organization.id, settings) < points:
        return
    idempotency_key = f"loyalty_campaign:{campaign.public_id}:user:{user.public_id}:payment:{payment_id or 'none'}"
    existing = db.query(LoyaltyLedgerEntry).filter(LoyaltyLedgerEntry.idempotency_key == idempotency_key).first()
    if existing:
        return
    expires_at = None
    if point_type == "promo":
        expires_at = now_utc() + timedelta(days=settings.promo_expiration_days)
    else:
        expires_at = now_utc() + timedelta(days=settings.earned_expiration_days)
    write_ledger_entry(
        db,
        wallet,
        entry_type=f"{campaign.campaign_type}_grant",
        point_type=point_type,
        points=points,
        source=source,
        source_public_id=campaign.public_id,
        campaign_id=campaign.id,
        payment_id=payment_id,
        booking_id=booking_id,
        booking_request_id=booking_request_id,
        expires_at=expires_at,
        idempotency_key=idempotency_key,
        note=campaign.name,
    )
    campaign.issued_points = (campaign.issued_points or 0) + points
    db.add(campaign)


def grant_signup_campaigns(db: Session, organization: Organization, user: User, wallet: LoyaltyWallet) -> None:
    for campaign in active_campaigns(db, organization.id, "signup_bonus"):
        grant_campaign_points(db, organization, user, wallet, campaign, source="signup")


def calculate_earned_points(settings: LoyaltyOwnerSetting, net_amount_cents: int) -> int:
    if not settings.is_enabled or settings.earn_rate_bps <= 0 or settings.point_value_cents <= 0:
        return 0
    earned_value_cents = floor(net_amount_cents * settings.earn_rate_bps / 10_000)
    return max(0, floor(earned_value_cents / settings.point_value_cents))


def _payment_amount_cents(payment: Payment) -> int:
    if payment.amount_cents is not None:
        return int(payment.amount_cents)
    return int(payment.amount or 0) * 100


def record_earned_for_payment(
    db: Session,
    payment: Payment,
    *,
    booking: Booking | None = None,
    booking_request: BookingRequest | None = None,
) -> None:
    if payment.status != PaymentStatus.SUCCEEDED or payment.tenant_id is None or payment.user_id is None:
        return
    organization = db.query(Organization).filter(Organization.id == payment.tenant_id).first()
    user = db.query(User).filter(User.id == payment.user_id).first()
    if not organization or not user:
        return
    settings = get_settings(db, organization.id)
    if settings is None or not settings.is_enabled:
        return
    wallet = get_or_create_wallet(db, organization, user)
    net_amount_cents = _payment_amount_cents(payment)
    points = calculate_earned_points(settings, net_amount_cents)
    if points > 0:
        write_ledger_entry(
            db,
            wallet,
            entry_type="earned_grant",
            point_type="earned",
            points=points,
            source="payment",
            source_public_id=payment.public_id,
            booking_request_id=booking_request.id if booking_request else None,
            booking_id=booking.id if booking else payment.booking_id,
            payment_id=payment.id,
            expires_at=now_utc() + timedelta(days=settings.earned_expiration_days),
            idempotency_key=f"loyalty_earn:payment:{payment.public_id}",
            note="Earned from paid booking or membership",
            metadata_json={"net_amount_cents": net_amount_cents, "earn_rate_bps": settings.earn_rate_bps},
        )

    previous_success_count = (
        db.query(Payment)
        .filter(
            Payment.user_id == payment.user_id,
            Payment.tenant_id == payment.tenant_id,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.id != payment.id,
        )
        .count()
    )
    if previous_success_count == 0:
        for campaign in active_campaigns(db, organization.id, "first_booking_bonus"):
            grant_campaign_points(
                db,
                organization,
                user,
                wallet,
                campaign,
                source="first_booking",
                payment_id=payment.id,
                booking_id=booking.id if booking else payment.booking_id,
                booking_request_id=booking_request.id if booking_request else None,
            )
    db.commit()


def _active_volume_discounts(db: Session, space_id: int) -> list[VolumeDiscount]:
    rows = (
        db.query(SpaceVolumeDiscount)
        .filter(SpaceVolumeDiscount.space_id == space_id, SpaceVolumeDiscount.is_active.is_(True))
        .all()
    )
    return [VolumeDiscount(min_hours=float(row.min_hours), discount_percent=int(row.discount_percent)) for row in rows]


def _granularity_to_minutes(value: Any) -> int:
    raw = getattr(value, "value", value)
    return {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}.get(raw, 60)


def calculate_booking_subtotal_cents(
    db: Session,
    space: Space,
    start_datetime: datetime,
    end_datetime: datetime,
    *,
    booking_mode: str | None = None,
    full_day: bool = False,
) -> int:
    now = now_utc()
    rule = (
        db.query(PricingRule)
        .filter(
            PricingRule.space_id == space.id,
            (PricingRule.active_from.is_(None) | (PricingRule.active_from <= now)),
            (PricingRule.active_to.is_(None) | (PricingRule.active_to >= now)),
        )
        .order_by(PricingRule.created_at.desc())
        .first()
    )
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first()
    granularity_minutes = _granularity_to_minutes(location.booking_granularity) if location and location.booking_granularity else 60
    result = estimate_booking_price(
        start_datetime,
        end_datetime,
        price_hourly=space.price_hourly,
        price_daily=space.price_daily,
        price_monthly=space.price_monthly,
        rate_type=rule.rate_type if rule else None,
        rate_amount=rule.rate_amount if rule else None,
        booking_mode=booking_mode,
        full_day=full_day,
        volume_discounts=_active_volume_discounts(db, space.id),
        granularity_minutes=granularity_minutes,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")
    # Current app booking prices are persisted and charged as whole-dollar integers;
    # convert that boundary value to cents for loyalty accounting.
    return max(0, int(result.total_cents) * 100)


def preview_redemption(
    db: Session,
    user: User,
    *,
    space_public_id: str,
    start_datetime: datetime,
    end_datetime: datetime,
    booking_mode: str | None = None,
    full_day: bool = False,
    points_requested: int | None = None,
) -> RedemptionPreview:
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    settings = get_settings(db, organization.id)
    wallet = get_or_create_wallet(db, organization, user)
    subtotal_cents = calculate_booking_subtotal_cents(
        db,
        space,
        start_datetime,
        end_datetime,
        booking_mode=booking_mode,
        full_day=full_day,
    )

    if settings is None or not settings.is_enabled:
        return RedemptionPreview(False, "Loyalty is not enabled for this owner", organization, wallet, settings, subtotal_cents, 0, 0, 0, 0)
    if space.space_type not in REDEEMABLE_SPACE_TYPES:
        return RedemptionPreview(False, "Rewards cannot be redeemed for this space type", organization, wallet, settings, subtotal_cents, 0, 0, 0, 0)
    total_balance = (wallet.promo_balance or 0) + (wallet.earned_balance or 0)
    if total_balance <= 0:
        return RedemptionPreview(False, "No points available for this owner", organization, wallet, settings, subtotal_cents, 0, 0, 0, 0)

    max_discount_cents = floor(subtotal_cents * settings.max_redemption_percent / 100)
    max_points_by_value = floor(max_discount_cents / settings.point_value_cents) if settings.point_value_cents else 0
    max_redeemable_points = max(0, min(total_balance, max_points_by_value))
    requested = min(points_requested if points_requested is not None else max_redeemable_points, max_redeemable_points)
    discount_cents = min(requested * settings.point_value_cents, max_discount_cents)
    return RedemptionPreview(
        True,
        None,
        organization,
        wallet,
        settings,
        subtotal_cents,
        max_redeemable_points,
        max_discount_cents,
        requested,
        discount_cents,
    )


def lock_redemption(
    db: Session,
    user: User,
    *,
    space_public_id: str,
    start_datetime: datetime,
    end_datetime: datetime,
    booking_mode: str | None,
    full_day: bool,
    points_requested: int,
    idempotency_key: str | None = None,
) -> LoyaltyRedemptionLock:
    if not user.email_verified:
        raise HTTPException(status_code=400, detail="Email verification is required before redeeming points")
    if idempotency_key:
        existing = (
            db.query(LoyaltyRedemptionLock)
            .filter(LoyaltyRedemptionLock.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return existing
    preview = preview_redemption(
        db,
        user,
        space_public_id=space_public_id,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        booking_mode=booking_mode,
        full_day=full_day,
        points_requested=points_requested,
    )
    if not preview.eligible or preview.requested_points <= 0 or not preview.wallet or not preview.organization:
        raise HTTPException(status_code=400, detail=preview.reason or "Points are not redeemable")
    if points_requested > preview.max_redeemable_points:
        raise HTTPException(status_code=400, detail="Requested points exceed redeemable balance")
    wallet = preview.wallet
    promo_points = min(wallet.promo_balance or 0, preview.requested_points)
    earned_points = preview.requested_points - promo_points
    lock = LoyaltyRedemptionLock(
        organization_id=preview.organization.id,
        tenant_id=preview.organization.id,
        wallet_id=wallet.id,
        user_id=user.id,
        space_id=db.query(Space.id).filter(Space.public_id == space_public_id).scalar(),
        promo_points=promo_points,
        earned_points=earned_points,
        points=preview.requested_points,
        discount_cents=preview.discount_cents,
        status="active",
        expires_at=now_utc() + timedelta(minutes=LOCK_TTL_MINUTES),
        idempotency_key=idempotency_key,
        metadata_json={
            "space_public_id": space_public_id,
            "start_datetime": start_datetime.isoformat(),
            "end_datetime": end_datetime.isoformat(),
            "booking_mode": booking_mode,
            "full_day": full_day,
            "subtotal_cents": preview.subtotal_cents,
        },
    )
    db.add(lock)
    db.flush()
    if promo_points:
        write_ledger_entry(
            db,
            wallet,
            entry_type="redemption_lock",
            point_type="promo",
            points=-promo_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"loyalty_lock:{lock.public_id}:promo",
            note="Points locked for booking checkout",
        )
    if earned_points:
        write_ledger_entry(
            db,
            wallet,
            entry_type="redemption_lock",
            point_type="earned",
            points=-earned_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"loyalty_lock:{lock.public_id}:earned",
            note="Points locked for booking checkout",
        )
    db.commit()
    db.refresh(lock)
    return lock


def attach_lock_to_booking_request(db: Session, req: BookingRequest, lock_public_id: str | None, user: User, space: Space) -> None:
    if not lock_public_id:
        return
    lock = (
        db.query(LoyaltyRedemptionLock)
        .filter(LoyaltyRedemptionLock.public_id == lock_public_id)
        .with_for_update()
        .first()
    )
    if not lock:
        raise HTTPException(status_code=404, detail="Redemption lock not found")
    if lock.user_id != user.id or lock.organization_id != space.tenant_id or lock.space_id != space.id:
        raise HTTPException(status_code=403, detail="Redemption lock does not match this booking")
    if lock.status != "active":
        raise HTTPException(status_code=400, detail="Redemption lock is not active")
    expires = as_utc(lock.expires_at)
    if expires and expires <= now_utc():
        release_redemption_lock(db, lock, reason="expired")
        raise HTTPException(status_code=400, detail="Redemption lock has expired")
    if lock.booking_request_id and lock.booking_request_id != req.id:
        raise HTTPException(status_code=400, detail="Redemption lock is already attached")
    lock.booking_request_id = req.id
    req.loyalty_redemption_lock_id = lock.id
    db.add(lock)
    db.add(req)


def active_lock_for_request(db: Session, req: BookingRequest) -> LoyaltyRedemptionLock | None:
    if not req.loyalty_redemption_lock_id:
        return None
    lock = db.query(LoyaltyRedemptionLock).filter(LoyaltyRedemptionLock.id == req.loyalty_redemption_lock_id).first()
    if not lock or lock.status != "active":
        return None
    expires = as_utc(lock.expires_at)
    if expires and expires <= now_utc():
        release_redemption_lock(db, lock, reason="expired")
        return None
    return lock


def discount_cents_for_request(db: Session, req: BookingRequest) -> int:
    lock = active_lock_for_request(db, req)
    return lock.discount_cents if lock else 0


def release_redemption_lock(db: Session, lock: LoyaltyRedemptionLock, *, reason: str = "released") -> None:
    if lock.status != "active":
        return
    wallet = db.query(LoyaltyWallet).filter(LoyaltyWallet.id == lock.wallet_id).first()
    if not wallet:
        return
    if lock.promo_points:
        write_ledger_entry(
            db,
            wallet,
            entry_type="redemption_release",
            point_type="promo",
            points=lock.promo_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"loyalty_lock_release:{lock.public_id}:promo",
            note=f"Redemption lock {reason}",
        )
    if lock.earned_points:
        write_ledger_entry(
            db,
            wallet,
            entry_type="redemption_release",
            point_type="earned",
            points=lock.earned_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"loyalty_lock_release:{lock.public_id}:earned",
            note=f"Redemption lock {reason}",
        )
    lock.status = reason if reason in {"released", "expired"} else "released"
    db.add(lock)
    db.flush()


def release_redemption_for_request(db: Session, req: BookingRequest, *, reason: str = "released") -> None:
    if not req.loyalty_redemption_lock_id:
        return
    lock = db.query(LoyaltyRedemptionLock).filter(LoyaltyRedemptionLock.id == req.loyalty_redemption_lock_id).first()
    if lock:
        release_redemption_lock(db, lock, reason=reason)


def finalize_redemption_for_payment(db: Session, req: BookingRequest, booking: Booking, payment: Payment) -> None:
    lock = active_lock_for_request(db, req)
    if not lock:
        return
    existing = db.query(LoyaltyRedemption).filter(LoyaltyRedemption.redemption_lock_id == lock.id).first()
    if existing:
        return
    redemption = LoyaltyRedemption(
        organization_id=lock.organization_id,
        tenant_id=lock.tenant_id,
        wallet_id=lock.wallet_id,
        user_id=lock.user_id,
        redemption_lock_id=lock.id,
        booking_request_id=req.id,
        booking_id=booking.id,
        payment_id=payment.id,
        promo_points=lock.promo_points,
        earned_points=lock.earned_points,
        points=lock.points,
        discount_cents=lock.discount_cents,
        status="finalized",
    )
    lock.status = "finalized"
    db.add(redemption)
    db.add(lock)
    db.flush()
    entries = (
        db.query(LoyaltyLedgerEntry)
        .filter(LoyaltyLedgerEntry.redemption_lock_id == lock.id, LoyaltyLedgerEntry.entry_type == "redemption_lock")
        .all()
    )
    for entry in entries:
        entry.redemption_id = redemption.id
        entry.booking_request_id = req.id
        entry.booking_id = booking.id
        entry.payment_id = payment.id
        db.add(entry)


def reverse_for_payment_refund(db: Session, payment: Payment) -> None:
    if not payment.id:
        return
    redemptions = (
        db.query(LoyaltyRedemption)
        .filter(LoyaltyRedemption.payment_id == payment.id, LoyaltyRedemption.status == "finalized")
        .all()
    )
    for redemption in redemptions:
        wallet = db.query(LoyaltyWallet).filter(LoyaltyWallet.id == redemption.wallet_id).first()
        if not wallet:
            continue
        if redemption.promo_points:
            write_ledger_entry(
                db,
                wallet,
                entry_type="redemption_reversal",
                point_type="promo",
                points=redemption.promo_points,
                source="refund",
                source_public_id=payment.public_id,
                payment_id=payment.id,
                redemption_id=redemption.id,
                idempotency_key=f"loyalty_redemption_refund:{redemption.public_id}:promo",
                note="Restored after refund",
            )
        if redemption.earned_points:
            write_ledger_entry(
                db,
                wallet,
                entry_type="redemption_reversal",
                point_type="earned",
                points=redemption.earned_points,
                source="refund",
                source_public_id=payment.public_id,
                payment_id=payment.id,
                redemption_id=redemption.id,
                idempotency_key=f"loyalty_redemption_refund:{redemption.public_id}:earned",
                note="Restored after refund",
            )
        redemption.status = "reversed"
        db.add(redemption)

    earned_entries = (
        db.query(LoyaltyLedgerEntry)
        .filter(
            LoyaltyLedgerEntry.payment_id == payment.id,
            LoyaltyLedgerEntry.points > 0,
            LoyaltyLedgerEntry.entry_type.in_(["earned_grant", "first_booking_bonus_grant"]),
        )
        .all()
    )
    for entry in earned_entries:
        wallet = db.query(LoyaltyWallet).filter(LoyaltyWallet.id == entry.wallet_id).first()
        if not wallet:
            continue
        write_ledger_entry(
            db,
            wallet,
            entry_type="earned_reversal",
            point_type=entry.point_type,
            points=-entry.points,
            source="refund",
            source_public_id=payment.public_id,
            payment_id=payment.id,
            booking_id=entry.booking_id,
            booking_request_id=entry.booking_request_id,
            idempotency_key=f"loyalty_earn_refund:{entry.public_id}",
            note="Reversed after refund",
        )
    db.commit()


def wallet_expiration_summary(db: Session, wallet: LoyaltyWallet) -> tuple[datetime | None, int]:
    now = now_utc()
    entry = (
        db.query(LoyaltyLedgerEntry.expires_at, func.sum(LoyaltyLedgerEntry.points))
        .filter(
            LoyaltyLedgerEntry.wallet_id == wallet.id,
            LoyaltyLedgerEntry.points > 0,
            LoyaltyLedgerEntry.expires_at.is_not(None),
            LoyaltyLedgerEntry.expires_at > now,
        )
        .group_by(LoyaltyLedgerEntry.expires_at)
        .order_by(LoyaltyLedgerEntry.expires_at.asc())
        .first()
    )
    if not entry:
        return None, 0
    return entry[0], int(entry[1] or 0)


def owner_summary(db: Session, organization: Organization) -> dict[str, Any]:
    wallets = db.query(LoyaltyWallet).filter(LoyaltyWallet.organization_id == organization.id).all()
    settings = get_settings(db, organization.id)
    point_value = settings.point_value_cents if settings else 1
    positive = (
        db.query(func.coalesce(func.sum(LoyaltyLedgerEntry.points), 0))
        .filter(LoyaltyLedgerEntry.organization_id == organization.id, LoyaltyLedgerEntry.points > 0)
        .scalar()
        or 0
    )
    redeemed = (
        db.query(func.coalesce(func.sum(LoyaltyRedemption.points), 0))
        .filter(LoyaltyRedemption.organization_id == organization.id)
        .scalar()
        or 0
    )
    outstanding = sum((wallet.promo_balance or 0) + (wallet.earned_balance or 0) for wallet in wallets)
    member_ids = interacted_user_ids(db, organization.id)
    repeat_count = 0
    for user_id in member_ids:
        paid_count = (
            db.query(Payment)
            .filter(Payment.tenant_id == organization.id, Payment.user_id == user_id, Payment.status == PaymentStatus.SUCCEEDED)
            .count()
        )
        if paid_count > 1:
            repeat_count += 1
    top_members = []
    users_by_id = {u.id: u for u in db.query(User).filter(User.id.in_([wallet.user_id for wallet in wallets] or [0])).all()}
    for wallet in sorted(wallets, key=lambda row: (row.promo_balance or 0) + (row.earned_balance or 0), reverse=True)[:5]:
        user = users_by_id.get(wallet.user_id)
        top_members.append(
            {
                "user_public_id": user.public_id if user else None,
                "name": (user.full_name or user.email) if user else "Unknown",
                "email": user.email if user else "",
                "points": (wallet.promo_balance or 0) + (wallet.earned_balance or 0),
                "tier": wallet.tier,
            }
        )
    campaigns = db.query(LoyaltyCampaign).filter(LoyaltyCampaign.organization_id == organization.id).count()
    return {
        "organization_public_id": organization.public_id,
        "points_issued": int(positive),
        "points_redeemed": int(redeemed),
        "outstanding_points": int(outstanding),
        "outstanding_liability_cents": int(outstanding * point_value),
        "redemption_rate_percent": round((redeemed / positive) * 100, 1) if positive else 0.0,
        "repeat_member_rate_percent": round((repeat_count / len(member_ids)) * 100, 1) if member_ids else 0.0,
        "active_wallets": len(wallets),
        "campaigns": campaigns,
        "top_members": top_members,
    }
