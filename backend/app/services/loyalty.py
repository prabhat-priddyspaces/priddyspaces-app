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
from app.models.enums import BookingMode, PaymentStatus, SpaceType, UserAppRole
from app.models.location import Location
from app.models.loyalty import (
    LoyaltyCampaign,
    LoyaltyLedgerEntry,
    LoyaltyOwnerSetting,
    LoyaltyRedemption,
    LoyaltyRedemptionLock,
    LoyaltyWallet,
    PriddyPointsLedgerEntry,
    PriddyPointsWallet,
)
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.tax_config import TaxConfig
from app.models.user import User
from app.services.org_member_stats import interacted_user_ids
from app.services.platform_auth import get_or_create_platform_settings
from app.services.pricing import estimate_booking_price
from app.services.pricing_rules import (
    active_volume_discounts,
    get_active_pricing_rule,
    granularity_to_minutes,
)
from app.services.setup_fees import setup_fee_amount_cents

POINT_VALUE_CENTS_MIN = 1
POINT_VALUE_CENTS_MAX = 10
EARN_RATE_BPS_MIN = 0
EARN_RATE_BPS_MAX = 2000
MAX_REDEMPTION_PERCENT_MAX = 100
PROMO_GRANT_MAX_POINTS = 1_000_000
LOCK_TTL_MINUTES = 30
DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES = ["conference_room", "shared_desk", "virtual_office"]
DEFAULT_OWNER_REDEEMABLE_BOOKING_MODES = ["hourly", "day_pass"]
DEFAULT_PRIDDY_REDEEMABLE_SPACE_TYPES = ["shared_desk"]
DEFAULT_PRIDDY_REDEEMABLE_BOOKING_MODES = ["day_pass"]


@dataclass(frozen=True)
class RedemptionBucket:
    eligible: bool
    reason: str | None
    balance: int
    point_value_cents: int
    max_redeemable_points: int
    requested_points: int
    discount_cents: int


@dataclass(frozen=True)
class RedemptionPreview:
    eligible: bool
    reason: str | None
    organization: Organization | None
    wallet: LoyaltyWallet | None
    priddy_wallet: PriddyPointsWallet | None
    settings: LoyaltyOwnerSetting | None
    subtotal_cents: int
    max_redeemable_points: int
    max_discount_cents: int
    requested_points: int
    discount_cents: int
    priddy: RedemptionBucket
    owner: RedemptionBucket


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


def earn_points_per_100_dollars(settings: LoyaltyOwnerSetting) -> float:
    return round(earn_points_per_dollar(settings) * 100, 4)


def earn_rate_bps_for_points_per_100(points_per_100: float, point_value_cents: int) -> int:
    return int(round(float(points_per_100 or 0) * max(1, point_value_cents)))


def _list_or_default(value: Any, default: list[str]) -> list[str]:
    if isinstance(value, list):
        cleaned = [str(item) for item in value if str(item)]
        return cleaned or list(default)
    return list(default)


def _booking_mode_value(booking_mode: str | None, full_day: bool) -> str:
    if full_day or booking_mode == BookingMode.DAY_PASS.value:
        return BookingMode.DAY_PASS.value
    return BookingMode.HOURLY.value


def _space_type_value(space: Space) -> str:
    return getattr(space.space_type, "value", space.space_type)


def _empty_bucket(reason: str | None, *, point_value_cents: int = 1, balance: int = 0) -> RedemptionBucket:
    return RedemptionBucket(
        eligible=False,
        reason=reason,
        balance=max(0, balance),
        point_value_cents=point_value_cents,
        max_redeemable_points=0,
        requested_points=0,
        discount_cents=0,
    )


def get_settings(db: Session, organization_id: int, *, create: bool = True, actor_id: int | None = None) -> LoyaltyOwnerSetting | None:
    setting = (
        db.query(LoyaltyOwnerSetting)
        .filter(LoyaltyOwnerSetting.organization_id == organization_id)
        .first()
    )
    if setting:
        if not setting.allowed_space_types:
            setting.allowed_space_types = list(DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES)
        if not setting.allowed_booking_modes:
            setting.allowed_booking_modes = list(DEFAULT_OWNER_REDEEMABLE_BOOKING_MODES)
        return setting
    if not create:
        return setting
    setting = LoyaltyOwnerSetting(
        organization_id=organization_id,
        tenant_id=organization_id,
        updated_by_user_id=actor_id,
        allowed_space_types=list(DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES),
        allowed_booking_modes=list(DEFAULT_OWNER_REDEEMABLE_BOOKING_MODES),
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
    allowed_space_types = set(DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES + ["private_office", "suite"])
    if any(space_type not in allowed_space_types for space_type in _list_or_default(setting.allowed_space_types, DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES)):
        raise HTTPException(status_code=400, detail="Unsupported loyalty space type")
    if any(mode not in {"hourly", "day_pass"} for mode in _list_or_default(setting.allowed_booking_modes, DEFAULT_OWNER_REDEEMABLE_BOOKING_MODES)):
        raise HTTPException(status_code=400, detail="Unsupported loyalty booking mode")


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


def get_priddy_wallet(db: Session, user_id: int) -> PriddyPointsWallet | None:
    return db.query(PriddyPointsWallet).filter(PriddyPointsWallet.user_id == user_id).first()


def get_or_create_priddy_wallet(db: Session, user: User) -> PriddyPointsWallet:
    wallet = get_priddy_wallet(db, user.id)
    if wallet:
        return wallet
    wallet = PriddyPointsWallet(user_id=user.id)
    db.add(wallet)
    db.flush()
    return wallet


def _priddy_delta(wallet: PriddyPointsWallet, points: int) -> None:
    wallet.balance += points
    if wallet.balance < 0:
        raise HTTPException(status_code=400, detail="Insufficient Priddy Points")
    if points > 0:
        wallet.lifetime_earned_points += points


def write_priddy_ledger_entry(
    db: Session,
    wallet: PriddyPointsWallet,
    *,
    entry_type: str,
    points: int,
    source: str,
    source_public_id: str | None = None,
    booking_request_id: int | None = None,
    booking_id: int | None = None,
    payment_id: int | None = None,
    redemption_id: int | None = None,
    redemption_lock_id: int | None = None,
    expires_at: datetime | None = None,
    idempotency_key: str | None = None,
    note: str | None = None,
    metadata_json: dict[str, Any] | None = None,
) -> PriddyPointsLedgerEntry:
    if idempotency_key:
        existing = (
            db.query(PriddyPointsLedgerEntry)
            .filter(PriddyPointsLedgerEntry.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            return existing
    if points == 0:
        raise HTTPException(status_code=400, detail="Point ledger entries cannot be zero")
    _priddy_delta(wallet, points)
    entry = PriddyPointsLedgerEntry(
        wallet_id=wallet.id,
        user_id=wallet.user_id,
        entry_type=entry_type,
        points=points,
        source=source,
        source_public_id=source_public_id,
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


def grant_priddy_signup_points(db: Session, user: User) -> PriddyPointsWallet | None:
    if user.role != UserAppRole.MEMBER:
        return None
    settings = get_or_create_platform_settings(db)
    if not settings.priddy_points_enabled or settings.priddy_signup_points <= 0:
        return get_or_create_priddy_wallet(db, user)
    wallet = get_or_create_priddy_wallet(db, user)
    write_priddy_ledger_entry(
        db,
        wallet,
        entry_type="signup_grant",
        points=settings.priddy_signup_points,
        source="signup",
        source_public_id=user.public_id,
        idempotency_key=f"priddy_signup:{user.public_id}",
        note="Signup Priddy Points",
        metadata_json={"point_value_cents": settings.priddy_point_value_cents},
    )
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
    space_id = booking.space_id if booking else booking_request.space_id if booking_request else None
    if not space_id:
        return
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        return
    mode = BookingMode.DAY_PASS.value if booking_request and getattr(booking_request.request_kind, "value", booking_request.request_kind) == "daily_booking" else BookingMode.HOURLY.value
    allowed, _reason = _owner_points_allowed(settings, space, mode, for_redemption=False)
    if not allowed:
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


def calculate_booking_subtotal_cents(
    db: Session,
    space: Space,
    start_datetime: datetime,
    end_datetime: datetime,
    *,
    booking_mode: str | None = None,
    full_day: bool = False,
) -> int:
    rule = get_active_pricing_rule(db, space.id)
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first()
    granularity_minutes = granularity_to_minutes(location.booking_granularity) if location and location.booking_granularity else 60
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
        volume_discounts=active_volume_discounts(db, space.id),
        granularity_minutes=granularity_minutes,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if result is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")
    setup_fee_cents = setup_fee_amount_cents(db, space.id)
    setup_fee_tax_cents = int(round(setup_fee_cents * (tax.rate_percent / 100.0))) if tax else 0
    return max(0, int(result.total_cents) + setup_fee_cents + setup_fee_tax_cents)


def _owner_points_allowed(
    settings: LoyaltyOwnerSetting | None,
    space: Space,
    booking_mode: str,
    *,
    for_redemption: bool,
) -> tuple[bool, str | None]:
    if settings is None or not settings.is_enabled:
        return False, "Owner points are not enabled for this owner"
    if for_redemption and not settings.owner_points_redemption_enabled:
        return False, "Owner points cannot be redeemed for this owner"
    if _space_type_value(space) not in _list_or_default(settings.allowed_space_types, DEFAULT_OWNER_REDEEMABLE_SPACE_TYPES):
        return False, "Owner points are not available for this space type"
    if booking_mode not in _list_or_default(settings.allowed_booking_modes, DEFAULT_OWNER_REDEEMABLE_BOOKING_MODES):
        return False, "Owner points are not available for this booking type"
    return True, None


def _priddy_points_allowed(
    db: Session,
    settings: LoyaltyOwnerSetting | None,
    space: Space,
    booking_mode: str,
) -> tuple[bool, str | None, int]:
    platform = get_or_create_platform_settings(db)
    point_value = platform.priddy_point_value_cents or 1
    if not platform.priddy_points_enabled:
        return False, "Priddy Points are not enabled", point_value
    if settings is None or not settings.accepts_priddy_points:
        return False, "This owner does not accept Priddy Points", point_value
    if _space_type_value(space) not in _list_or_default(platform.priddy_allowed_space_types, DEFAULT_PRIDDY_REDEEMABLE_SPACE_TYPES):
        return False, "Priddy Points are not available for this space type", point_value
    if booking_mode not in _list_or_default(platform.priddy_allowed_booking_modes, DEFAULT_PRIDDY_REDEEMABLE_BOOKING_MODES):
        return False, "Priddy Points are not available for this booking type", point_value
    return True, None, point_value


def _bucket_from_balance(
    *,
    eligible: bool,
    reason: str | None,
    balance: int,
    point_value_cents: int,
    remaining_discount_cents: int,
    requested_points: int | None,
) -> RedemptionBucket:
    if not eligible:
        return _empty_bucket(reason, point_value_cents=point_value_cents, balance=balance)
    if balance <= 0:
        return _empty_bucket("No points available", point_value_cents=point_value_cents, balance=0)
    max_points_by_value = floor(max(0, remaining_discount_cents) / point_value_cents) if point_value_cents else 0
    max_redeemable_points = max(0, min(balance, max_points_by_value))
    requested = min(requested_points if requested_points is not None else max_redeemable_points, max_redeemable_points)
    discount_cents = min(requested * point_value_cents, max(0, remaining_discount_cents))
    return RedemptionBucket(
        eligible=max_redeemable_points > 0,
        reason=None if max_redeemable_points > 0 else "No redeemable amount remains",
        balance=balance,
        point_value_cents=point_value_cents,
        max_redeemable_points=max_redeemable_points,
        requested_points=requested,
        discount_cents=discount_cents,
    )


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
    priddy_points_requested: int | None = None,
    owner_points_requested: int | None = None,
) -> RedemptionPreview:
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    organization = db.query(Organization).filter(Organization.id == space.tenant_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    settings = get_settings(db, organization.id)
    wallet = get_or_create_wallet(db, organization, user, grant_signup=False)
    priddy_wallet = grant_priddy_signup_points(db, user) or get_or_create_priddy_wallet(db, user)
    subtotal_cents = calculate_booking_subtotal_cents(
        db,
        space,
        start_datetime,
        end_datetime,
        booking_mode=booking_mode,
        full_day=full_day,
    )
    mode = _booking_mode_value(booking_mode, full_day)
    if points_requested is not None and owner_points_requested is None and priddy_points_requested is None:
        owner_points_requested = points_requested

    max_discount_cents = floor(subtotal_cents * ((settings.max_redemption_percent if settings else 100) or 100) / 100)
    max_discount_cents = min(subtotal_cents, max_discount_cents)

    priddy_allowed, priddy_reason, priddy_point_value = _priddy_points_allowed(db, settings, space, mode)
    priddy_bucket = _bucket_from_balance(
        eligible=priddy_allowed,
        reason=priddy_reason,
        balance=priddy_wallet.balance or 0,
        point_value_cents=priddy_point_value,
        remaining_discount_cents=max_discount_cents,
        requested_points=priddy_points_requested,
    )

    owner_allowed, owner_reason = _owner_points_allowed(settings, space, mode, for_redemption=True)
    owner_balance = (wallet.promo_balance or 0) + (wallet.earned_balance or 0)
    owner_bucket = _bucket_from_balance(
        eligible=owner_allowed,
        reason=owner_reason,
        balance=owner_balance,
        point_value_cents=settings.point_value_cents if settings else 1,
        remaining_discount_cents=max(0, max_discount_cents - priddy_bucket.discount_cents),
        requested_points=owner_points_requested,
    )

    requested = priddy_bucket.requested_points + owner_bucket.requested_points
    discount_cents = priddy_bucket.discount_cents + owner_bucket.discount_cents
    max_redeemable_points = priddy_bucket.max_redeemable_points + owner_bucket.max_redeemable_points
    eligible = priddy_bucket.eligible or owner_bucket.eligible
    reason = None
    if not eligible:
        if owner_bucket.balance > 0 or (owner_points_requested or 0) > 0:
            reason = owner_bucket.reason or priddy_bucket.reason
        elif priddy_bucket.balance > 0 or (priddy_points_requested or 0) > 0:
            reason = priddy_bucket.reason or owner_bucket.reason
        else:
            reason = priddy_bucket.reason or owner_bucket.reason
        reason = reason or "Rewards are not available for this booking"
    return RedemptionPreview(
        eligible,
        reason,
        organization,
        wallet,
        priddy_wallet,
        settings,
        subtotal_cents,
        max_redeemable_points,
        max_discount_cents,
        requested,
        discount_cents,
        priddy_bucket,
        owner_bucket,
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
    points_requested: int | None = None,
    priddy_points_requested: int | None = None,
    owner_points_requested: int | None = None,
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
    if points_requested is not None and priddy_points_requested is None and owner_points_requested is None:
        owner_points_requested = points_requested
    if priddy_points_requested is not None or owner_points_requested is not None:
        priddy_points_requested = priddy_points_requested or 0
        owner_points_requested = owner_points_requested or 0
        points_requested = None
    preview = preview_redemption(
        db,
        user,
        space_public_id=space_public_id,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        booking_mode=booking_mode,
        full_day=full_day,
        points_requested=points_requested,
        priddy_points_requested=priddy_points_requested,
        owner_points_requested=owner_points_requested,
    )
    if not preview.eligible or preview.requested_points <= 0 or not preview.wallet or not preview.organization:
        raise HTTPException(status_code=400, detail=preview.reason or "Points are not redeemable")
    requested_total = (points_requested or 0) + (priddy_points_requested or 0) + (owner_points_requested or 0)
    if requested_total > preview.max_redeemable_points:
        raise HTTPException(status_code=400, detail="Requested points exceed redeemable balance")
    wallet = preview.wallet
    owner_requested = preview.owner.requested_points
    promo_points = min(wallet.promo_balance or 0, owner_requested)
    earned_points = owner_requested - promo_points
    priddy_points = preview.priddy.requested_points
    lock = LoyaltyRedemptionLock(
        organization_id=preview.organization.id,
        tenant_id=preview.organization.id,
        wallet_id=wallet.id,
        priddy_wallet_id=preview.priddy_wallet.id if preview.priddy_wallet and priddy_points else None,
        user_id=user.id,
        space_id=db.query(Space.id).filter(Space.public_id == space_public_id).scalar(),
        priddy_points=priddy_points,
        promo_points=promo_points,
        earned_points=earned_points,
        points=priddy_points + promo_points + earned_points,
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
    if priddy_points and preview.priddy_wallet:
        write_priddy_ledger_entry(
            db,
            preview.priddy_wallet,
            entry_type="redemption_lock",
            points=-priddy_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"priddy_lock:{lock.public_id}",
            note="Priddy Points locked for booking checkout",
        )
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
    lock = active_lock_by_public_id(db, lock_public_id, user, space)
    if not lock:
        return
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


def active_lock_by_public_id(db: Session, lock_public_id: str | None, user: User, space: Space) -> LoyaltyRedemptionLock | None:
    if not lock_public_id:
        return None
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
    return lock


def release_redemption_lock(db: Session, lock: LoyaltyRedemptionLock, *, reason: str = "released") -> None:
    if lock.status != "active":
        return
    wallet = db.query(LoyaltyWallet).filter(LoyaltyWallet.id == lock.wallet_id).first()
    priddy_wallet = (
        db.query(PriddyPointsWallet).filter(PriddyPointsWallet.id == lock.priddy_wallet_id).first()
        if lock.priddy_wallet_id
        else None
    )
    if lock.priddy_points and priddy_wallet:
        write_priddy_ledger_entry(
            db,
            priddy_wallet,
            entry_type="redemption_release",
            points=lock.priddy_points,
            source="redemption_lock",
            source_public_id=lock.public_id,
            redemption_lock_id=lock.id,
            idempotency_key=f"priddy_lock_release:{lock.public_id}",
            note=f"Priddy Points lock {reason}",
        )
    if not wallet:
        lock.status = reason if reason in {"released", "expired"} else "released"
        db.add(lock)
        db.flush()
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
        priddy_wallet_id=lock.priddy_wallet_id,
        user_id=lock.user_id,
        redemption_lock_id=lock.id,
        booking_request_id=req.id,
        booking_id=booking.id,
        payment_id=payment.id,
        priddy_points=lock.priddy_points,
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
    priddy_entries = (
        db.query(PriddyPointsLedgerEntry)
        .filter(PriddyPointsLedgerEntry.redemption_lock_id == lock.id, PriddyPointsLedgerEntry.entry_type == "redemption_lock")
        .all()
    )
    for entry in priddy_entries:
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
        priddy_wallet = (
            db.query(PriddyPointsWallet).filter(PriddyPointsWallet.id == redemption.priddy_wallet_id).first()
            if redemption.priddy_wallet_id
            else None
        )
        if redemption.priddy_points and priddy_wallet:
            write_priddy_ledger_entry(
                db,
                priddy_wallet,
                entry_type="redemption_reversal",
                points=redemption.priddy_points,
                source="refund",
                source_public_id=payment.public_id,
                payment_id=payment.id,
                redemption_id=redemption.id,
                idempotency_key=f"priddy_redemption_refund:{redemption.public_id}",
                note="Restored after refund",
            )
        if not wallet:
            redemption.status = "reversed"
            db.add(redemption)
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
