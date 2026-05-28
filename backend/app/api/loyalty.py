from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.enums import UserRole
from app.models.loyalty import LoyaltyCampaign, LoyaltyLedgerEntry, LoyaltyWallet, PriddyPointsLedgerEntry
from app.models.organization import Organization
from app.models.user import User
from app.schemas.loyalty import (
    LoyaltyCampaignCreate,
    LoyaltyCampaignOut,
    LoyaltyCampaignPreviewOut,
    LoyaltyCampaignUpdate,
    LoyaltyLedgerEntryOut,
    LoyaltyManualAdjustmentIn,
    LoyaltyOwnerSettingsOut,
    LoyaltyOwnerSettingsUpdate,
    LoyaltyOwnerSummaryOut,
    LoyaltyRedemptionLockIn,
    LoyaltyRedemptionLockOut,
    LoyaltyRedemptionBucketOut,
    LoyaltyRedemptionPreviewIn,
    LoyaltyRedemptionPreviewOut,
    LoyaltyWalletOut,
    PriddyPointsWalletOut,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, list_org_members, require_owner_or_admin
from app.services.loyalty import (
    earn_points_per_dollar,
    earn_points_per_100_dollars,
    earn_rate_bps_for_points_per_100,
    get_or_create_priddy_wallet,
    get_or_create_wallet,
    get_settings,
    lock_redemption,
    owner_summary,
    preview_redemption,
    validate_settings,
    wallet_expiration_summary,
    write_ledger_entry,
)
from app.services.platform_auth import get_or_create_platform_settings
from app.services.org_member_stats import interacted_user_ids

router = APIRouter(prefix="/loyalty", tags=["loyalty"])

OWNER_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}
MUTATION_ROLES = {UserRole.OWNER, UserRole.ADMIN}


def _accessible_orgs(db: Session, user_id: int) -> list[Organization]:
    members = list_org_members(db, user_id, OWNER_ROLES)
    org_ids = sorted({member.organization_id for member in members})
    if not org_ids:
        return []
    return db.query(Organization).filter(Organization.id.in_(org_ids)).all()


def _resolve_owner_org(db: Session, user_id: int, organization_public_id: str | None) -> Organization:
    orgs = _accessible_orgs(db, user_id)
    if not orgs:
        raise HTTPException(status_code=403, detail="No owner access")
    if organization_public_id:
        for org in orgs:
            if org.public_id == organization_public_id:
                return org
        raise HTTPException(status_code=404, detail="Organization not found")
    if len(orgs) > 1:
        raise HTTPException(status_code=400, detail="organization_public_id required for multi-org owner")
    return orgs[0]


def _require_mutation_access(db: Session, org: Organization, user: User) -> None:
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)


def _settings_out(org: Organization, setting) -> LoyaltyOwnerSettingsOut:
    return LoyaltyOwnerSettingsOut(
        public_id=setting.public_id,
        organization_public_id=org.public_id,
        is_enabled=setting.is_enabled,
        accepts_priddy_points=setting.accepts_priddy_points,
        owner_points_redemption_enabled=setting.owner_points_redemption_enabled,
        point_value_cents=setting.point_value_cents,
        earn_rate_bps=setting.earn_rate_bps,
        earn_points_per_dollar=earn_points_per_dollar(setting),
        earn_points_per_100_dollars=earn_points_per_100_dollars(setting),
        max_redemption_percent=setting.max_redemption_percent,
        allowed_space_types=setting.allowed_space_types or ["conference_room", "shared_desk", "virtual_office"],
        allowed_booking_modes=setting.allowed_booking_modes or ["hourly", "day_pass"],
        promo_expiration_days=setting.promo_expiration_days,
        earned_expiration_days=setting.earned_expiration_days,
        campaign_daily_issue_cap=setting.campaign_daily_issue_cap,
        max_promo_grant_points=setting.max_promo_grant_points,
        updated_at=setting.updated_at,
    )


def _wallet_out(db: Session, wallet: LoyaltyWallet, org: Organization) -> LoyaltyWalletOut:
    setting = get_settings(db, org.id)
    next_expiry, expiring_points = wallet_expiration_summary(db, wallet)
    total = (wallet.promo_balance or 0) + (wallet.earned_balance or 0)
    point_value = setting.point_value_cents if setting else 1
    return LoyaltyWalletOut(
        public_id=wallet.public_id,
        organization_public_id=org.public_id,
        organization_name=org.name,
        promo_balance=wallet.promo_balance or 0,
        earned_balance=wallet.earned_balance or 0,
        total_balance=total,
        lifetime_earned_points=wallet.lifetime_earned_points or 0,
        tier=wallet.tier,
        point_value_cents=point_value,
        cash_value_cents=total * point_value,
        next_expiration_at=next_expiry,
        expiring_points=expiring_points,
    )


def _priddy_wallet_out(db: Session, user: User) -> PriddyPointsWalletOut:
    settings = get_or_create_platform_settings(db)
    wallet = get_or_create_priddy_wallet(db, user)
    point_value = settings.priddy_point_value_cents or 1
    return PriddyPointsWalletOut(
        public_id=wallet.public_id,
        balance=wallet.balance or 0,
        lifetime_earned_points=wallet.lifetime_earned_points or 0,
        point_value_cents=point_value,
        cash_value_cents=(wallet.balance or 0) * point_value,
    )


def _campaign_out(org: Organization, campaign: LoyaltyCampaign) -> LoyaltyCampaignOut:
    return LoyaltyCampaignOut(
        public_id=campaign.public_id,
        organization_public_id=org.public_id,
        name=campaign.name,
        campaign_type=campaign.campaign_type,
        status=campaign.status,
        rules_json=campaign.rules_json or {},
        reward_json=campaign.reward_json or {},
        budget_points=campaign.budget_points,
        issued_points=campaign.issued_points or 0,
        starts_at=campaign.starts_at,
        ends_at=campaign.ends_at,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


@router.get("/wallets", response_model=list[LoyaltyWalletOut])
def list_wallets(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    wallets = db.query(LoyaltyWallet).filter(LoyaltyWallet.user_id == user.id).all()
    if not wallets:
        return []
    orgs = {
        org.id: org
        for org in db.query(Organization)
        .filter(Organization.id.in_([wallet.organization_id for wallet in wallets]))
        .all()
    }
    return [_wallet_out(db, wallet, orgs[wallet.organization_id]) for wallet in wallets if wallet.organization_id in orgs]


@router.get("/priddy-wallet", response_model=PriddyPointsWalletOut)
def get_priddy_wallet(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    result = _priddy_wallet_out(db, user)
    db.commit()
    return result


@router.get("/priddy-wallet/transactions", response_model=list[LoyaltyLedgerEntryOut])
def priddy_wallet_transactions(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    wallet = get_or_create_priddy_wallet(db, user)
    db.commit()
    rows = (
        db.query(PriddyPointsLedgerEntry)
        .filter(PriddyPointsLedgerEntry.wallet_id == wallet.id)
        .order_by(PriddyPointsLedgerEntry.created_at.desc())
        .all()
    )
    return [
        LoyaltyLedgerEntryOut(
            public_id=row.public_id,
            entry_type=row.entry_type,
            point_type="priddy",
            points=row.points,
            source=row.source,
            source_public_id=row.source_public_id,
            expires_at=row.expires_at,
            note=row.note,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/wallets/{organization_public_id}/transactions", response_model=list[LoyaltyLedgerEntryOut])
def wallet_transactions(
    organization_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    wallet = (
        db.query(LoyaltyWallet)
        .filter(LoyaltyWallet.organization_id == org.id, LoyaltyWallet.user_id == user.id)
        .first()
    )
    if not wallet:
        return []
    return (
        db.query(LoyaltyLedgerEntry)
        .filter(LoyaltyLedgerEntry.wallet_id == wallet.id)
        .order_by(LoyaltyLedgerEntry.created_at.desc())
        .all()
    )


@router.post("/redemptions/preview", response_model=LoyaltyRedemptionPreviewOut)
def redemption_preview(
    payload: LoyaltyRedemptionPreviewIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    preview = preview_redemption(
        db,
        user,
        space_public_id=payload.space_public_id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        points_requested=payload.points_requested,
        priddy_points_requested=payload.priddy_points_requested,
        owner_points_requested=payload.owner_points_requested,
    )
    # Preview may lazily create empty wallets so the UI has stable public ids.
    db.commit()
    wallet = preview.wallet
    return LoyaltyRedemptionPreviewOut(
        eligible=preview.eligible,
        reason=preview.reason,
        organization_public_id=preview.organization.public_id if preview.organization else None,
        wallet_public_id=wallet.public_id if wallet else None,
        promo_balance=wallet.promo_balance if wallet else 0,
        earned_balance=wallet.earned_balance if wallet else 0,
        total_balance=((wallet.promo_balance or 0) + (wallet.earned_balance or 0)) if wallet else 0,
        point_value_cents=preview.settings.point_value_cents if preview.settings else 1,
        subtotal_cents=preview.subtotal_cents,
        max_redeemable_points=preview.max_redeemable_points,
        max_discount_cents=preview.max_discount_cents,
        requested_points=preview.requested_points,
        discount_cents=preview.discount_cents,
        priddy=LoyaltyRedemptionBucketOut(
            eligible=preview.priddy.eligible,
            reason=preview.priddy.reason,
            balance=preview.priddy.balance,
            point_value_cents=preview.priddy.point_value_cents,
            max_redeemable_points=preview.priddy.max_redeemable_points,
            requested_points=preview.priddy.requested_points,
            discount_cents=preview.priddy.discount_cents,
        ),
        owner=LoyaltyRedemptionBucketOut(
            eligible=preview.owner.eligible,
            reason=preview.owner.reason,
            balance=preview.owner.balance,
            point_value_cents=preview.owner.point_value_cents,
            max_redeemable_points=preview.owner.max_redeemable_points,
            requested_points=preview.owner.requested_points,
            discount_cents=preview.owner.discount_cents,
        ),
    )


@router.post("/redemptions/lock", response_model=LoyaltyRedemptionLockOut)
def create_redemption_lock(
    payload: LoyaltyRedemptionLockIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    lock = lock_redemption(
        db,
        user,
        space_public_id=payload.space_public_id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        points_requested=payload.points_requested,
        priddy_points_requested=payload.priddy_points_requested,
        owner_points_requested=payload.owner_points_requested,
        idempotency_key=payload.idempotency_key,
    )
    org = db.query(Organization).filter(Organization.id == lock.organization_id).first()
    return LoyaltyRedemptionLockOut(
        public_id=lock.public_id,
        organization_public_id=org.public_id if org else "",
        points=lock.points,
        priddy_points=lock.priddy_points,
        promo_points=lock.promo_points,
        earned_points=lock.earned_points,
        discount_cents=lock.discount_cents,
        status=lock.status,
        expires_at=lock.expires_at,
    )


@router.get("/settings", response_model=LoyaltyOwnerSettingsOut)
def get_owner_settings(
    organization_public_id: str | None = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = _resolve_owner_org(db, user.id, organization_public_id)
    setting = get_settings(db, org.id, actor_id=user.id)
    db.commit()
    db.refresh(setting)
    return _settings_out(org, setting)


@router.put("/settings", response_model=LoyaltyOwnerSettingsOut)
def update_owner_settings(
    payload: LoyaltyOwnerSettingsUpdate,
    organization_public_id: str | None = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = _resolve_owner_org(db, user.id, organization_public_id)
    _require_mutation_access(db, org, user)
    setting = get_settings(db, org.id, actor_id=user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "earn_points_per_100_dollars":
            setting.earn_rate_bps = earn_rate_bps_for_points_per_100(value or 0, setting.point_value_cents)
            continue
        setattr(setting, field, value)
    if payload.point_value_cents is not None and payload.earn_points_per_100_dollars is not None:
        setting.earn_rate_bps = earn_rate_bps_for_points_per_100(
            payload.earn_points_per_100_dollars,
            setting.point_value_cents,
        )
    setting.updated_by_user_id = user.id
    validate_settings(setting)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return _settings_out(org, setting)


@router.get("/owner/summary", response_model=LoyaltyOwnerSummaryOut)
def get_owner_summary(
    organization_public_id: str | None = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = _resolve_owner_org(db, user.id, organization_public_id)
    return owner_summary(db, org)


@router.get("/campaigns", response_model=list[LoyaltyCampaignOut])
def list_campaigns(
    organization_public_id: str | None = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = _resolve_owner_org(db, user.id, organization_public_id)
    rows = (
        db.query(LoyaltyCampaign)
        .filter(LoyaltyCampaign.organization_id == org.id)
        .order_by(LoyaltyCampaign.created_at.desc())
        .all()
    )
    return [_campaign_out(org, row) for row in rows]


@router.post("/campaigns", response_model=LoyaltyCampaignOut)
def create_campaign(
    payload: LoyaltyCampaignCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = _resolve_owner_org(db, user.id, payload.organization_public_id)
    _require_mutation_access(db, org, user)
    if payload.status not in {"draft", "active", "paused", "archived"}:
        raise HTTPException(status_code=400, detail="Invalid campaign status")
    settings = get_settings(db, org.id)
    points = int((payload.reward_json or {}).get("points") or 0)
    point_type = str((payload.reward_json or {}).get("point_type") or "promo")
    if point_type == "promo" and points > settings.max_promo_grant_points:
        raise HTTPException(status_code=400, detail="Campaign reward exceeds promo grant guardrail")
    campaign = LoyaltyCampaign(
        organization_id=org.id,
        tenant_id=org.id,
        name=payload.name,
        campaign_type=payload.campaign_type,
        status=payload.status,
        rules_json=payload.rules_json,
        reward_json=payload.reward_json,
        budget_points=payload.budget_points,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        created_by_user_id=user.id,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_out(org, campaign)


@router.patch("/campaigns/{public_id}", response_model=LoyaltyCampaignOut)
def update_campaign(
    public_id: str,
    payload: LoyaltyCampaignUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    campaign = db.query(LoyaltyCampaign).filter(LoyaltyCampaign.public_id == public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    org = db.query(Organization).filter(Organization.id == campaign.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _resolve_owner_org(db, user.id, org.public_id)
    _require_mutation_access(db, org, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "status" and value not in {"draft", "active", "paused", "archived"}:
            raise HTTPException(status_code=400, detail="Invalid campaign status")
        setattr(campaign, field, value)
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return _campaign_out(org, campaign)


@router.get("/campaigns/{public_id}/preview", response_model=LoyaltyCampaignPreviewOut)
def preview_campaign(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    campaign = db.query(LoyaltyCampaign).filter(LoyaltyCampaign.public_id == public_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    org = db.query(Organization).filter(Organization.id == campaign.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Campaign not found")
    _resolve_owner_org(db, user.id, org.public_id)
    recipients = len(interacted_user_ids(db, org.id))
    if campaign.campaign_type == "signup_bonus":
        recipients = 0
    points = int((campaign.reward_json or {}).get("points") or 0)
    estimated = recipients * points
    return LoyaltyCampaignPreviewOut(
        estimated_recipients=recipients,
        estimated_points=estimated,
        budget_points=campaign.budget_points,
        within_budget=campaign.budget_points is None or estimated <= campaign.budget_points,
    )


@router.post("/manual-adjustments", response_model=LoyaltyWalletOut)
def manual_adjustment(
    payload: LoyaltyManualAdjustmentIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    actor = get_or_create_user(db, token)
    org = _resolve_owner_org(db, actor.id, payload.organization_public_id)
    _require_mutation_access(db, org, actor)
    if payload.point_type not in {"promo", "earned"}:
        raise HTTPException(status_code=400, detail="Invalid point type")
    settings = get_settings(db, org.id)
    if payload.point_type == "promo" and payload.points > settings.max_promo_grant_points:
        raise HTTPException(status_code=400, detail="Manual grant exceeds promo grant guardrail")
    target = db.query(User).filter(User.public_id == payload.user_public_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    allowed_users = interacted_user_ids(db, org.id)
    if target.id not in allowed_users:
        raise HTTPException(status_code=404, detail="Member not found")
    wallet = get_or_create_wallet(db, org, target)
    write_ledger_entry(
        db,
        wallet,
        entry_type="manual_adjustment",
        point_type=payload.point_type,
        points=payload.points,
        source="manual",
        source_public_id=actor.public_id,
        note=payload.note,
        idempotency_key=None,
    )
    db.commit()
    db.refresh(wallet)
    return _wallet_out(db, wallet, org)
