from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LoyaltyOwnerSettingsOut(BaseModel):
    public_id: str
    organization_public_id: str
    is_enabled: bool
    accepts_priddy_points: bool
    owner_points_redemption_enabled: bool
    point_value_cents: int
    earn_rate_bps: int
    earn_points_per_dollar: float
    earn_points_per_100_dollars: float
    max_redemption_percent: int
    allowed_space_types: list[str]
    allowed_booking_modes: list[str]
    promo_expiration_days: int
    earned_expiration_days: int
    campaign_daily_issue_cap: int
    max_promo_grant_points: int
    updated_at: datetime | None = None


class LoyaltyOwnerSettingsUpdate(BaseModel):
    is_enabled: bool | None = None
    accepts_priddy_points: bool | None = None
    owner_points_redemption_enabled: bool | None = None
    point_value_cents: int | None = Field(default=None, ge=1, le=10)
    earn_rate_bps: int | None = Field(default=None, ge=0, le=2000)
    earn_points_per_100_dollars: float | None = Field(default=None, ge=0, le=1000)
    max_redemption_percent: int | None = Field(default=None, ge=0, le=100)
    allowed_space_types: list[str] | None = None
    allowed_booking_modes: list[str] | None = None
    promo_expiration_days: int | None = Field(default=None, ge=1, le=730)
    earned_expiration_days: int | None = Field(default=None, ge=30, le=1095)
    campaign_daily_issue_cap: int | None = Field(default=None, ge=0, le=5000000)
    max_promo_grant_points: int | None = Field(default=None, ge=0, le=1000000)


class LoyaltyWalletOut(BaseModel):
    public_id: str
    organization_public_id: str
    organization_name: str
    promo_balance: int
    earned_balance: int
    total_balance: int
    lifetime_earned_points: int
    tier: str
    point_value_cents: int
    cash_value_cents: int
    next_expiration_at: datetime | None = None
    expiring_points: int = 0


class PriddyPointsWalletOut(BaseModel):
    public_id: str
    balance: int
    lifetime_earned_points: int
    point_value_cents: int
    cash_value_cents: int


class LoyaltyLedgerEntryOut(BaseModel):
    public_id: str
    entry_type: str
    point_type: str
    points: int
    source: str
    source_public_id: str | None = None
    expires_at: datetime | None = None
    note: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class LoyaltyRedemptionPreviewIn(BaseModel):
    space_public_id: str
    start_datetime: datetime
    end_datetime: datetime
    booking_mode: str | None = None
    full_day: bool = False
    points_requested: int | None = Field(default=None, ge=0)
    priddy_points_requested: int | None = Field(default=None, ge=0)
    owner_points_requested: int | None = Field(default=None, ge=0)


class LoyaltyRedemptionBucketOut(BaseModel):
    eligible: bool = False
    reason: str | None = None
    balance: int = 0
    point_value_cents: int = 1
    max_redeemable_points: int = 0
    requested_points: int = 0
    discount_cents: int = 0


class LoyaltyRedemptionPreviewOut(BaseModel):
    eligible: bool
    reason: str | None = None
    organization_public_id: str | None = None
    wallet_public_id: str | None = None
    promo_balance: int = 0
    earned_balance: int = 0
    total_balance: int = 0
    point_value_cents: int = 1
    subtotal_cents: int = 0
    max_redeemable_points: int = 0
    max_discount_cents: int = 0
    requested_points: int = 0
    discount_cents: int = 0
    priddy: LoyaltyRedemptionBucketOut = Field(default_factory=LoyaltyRedemptionBucketOut)
    owner: LoyaltyRedemptionBucketOut = Field(default_factory=LoyaltyRedemptionBucketOut)


class LoyaltyRedemptionLockIn(LoyaltyRedemptionPreviewIn):
    points_requested: int | None = Field(default=None, ge=1)
    idempotency_key: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _validate_points(self):
        requested = (self.points_requested or 0) + (self.priddy_points_requested or 0) + (self.owner_points_requested or 0)
        if requested <= 0:
            raise ValueError("At least one point must be requested")
        return self


class LoyaltyRedemptionLockOut(BaseModel):
    public_id: str
    organization_public_id: str
    points: int
    priddy_points: int = 0
    promo_points: int
    earned_points: int
    discount_cents: int
    status: str
    expires_at: datetime


class LoyaltyCampaignCreate(BaseModel):
    organization_public_id: str | None = None
    name: str
    campaign_type: str
    rules_json: dict[str, Any] = Field(default_factory=dict)
    reward_json: dict[str, Any] = Field(default_factory=dict)
    budget_points: int | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    status: str = "draft"

    @model_validator(mode="after")
    def _validate_reward(self):
        if self.campaign_type not in {
            "signup_bonus",
            "first_booking_bonus",
            "inactive_winback",
            "happy_hour",
            "weekend_multiplier",
            "manual",
        }:
            raise ValueError("Unsupported campaign type")
        return self


class LoyaltyCampaignUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    rules_json: dict[str, Any] | None = None
    reward_json: dict[str, Any] | None = None
    budget_points: int | None = Field(default=None, ge=0)
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class LoyaltyCampaignOut(BaseModel):
    public_id: str
    organization_public_id: str
    name: str
    campaign_type: str
    status: str
    rules_json: dict[str, Any]
    reward_json: dict[str, Any]
    budget_points: int | None
    issued_points: int
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LoyaltyCampaignPreviewOut(BaseModel):
    estimated_recipients: int
    estimated_points: int
    budget_points: int | None = None
    within_budget: bool


class LoyaltyManualAdjustmentIn(BaseModel):
    organization_public_id: str | None = None
    user_public_id: str
    point_type: str = "promo"
    points: int = Field(ge=1, le=1000000)
    note: str = Field(min_length=3, max_length=1024)


class LoyaltyOwnerSummaryOut(BaseModel):
    organization_public_id: str
    points_issued: int
    points_redeemed: int
    outstanding_points: int
    outstanding_liability_cents: int
    redemption_rate_percent: float
    repeat_member_rate_percent: float
    active_wallets: int
    campaigns: int
    top_members: list[dict[str, Any]]
