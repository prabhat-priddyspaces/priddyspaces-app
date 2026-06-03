from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class LoyaltyOwnerSetting(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_owner_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", name="uq_loyalty_owner_settings_org"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    is_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    accepts_priddy_points = Column(Boolean, nullable=False, default=False, server_default="false")
    owner_points_redemption_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    point_value_cents = Column(Integer, nullable=False, default=1, server_default="1")
    earn_rate_bps = Column(Integer, nullable=False, default=1, server_default="1")
    max_redemption_percent = Column(Integer, nullable=False, default=100, server_default="100")
    allowed_space_types = Column(JSON, nullable=False, default=lambda: ["conference_room", "shared_desk", "virtual_office"])
    allowed_booking_modes = Column(JSON, nullable=False, default=lambda: ["hourly", "day_pass"])
    promo_expiration_days = Column(Integer, nullable=False, default=180, server_default="180")
    earned_expiration_days = Column(Integer, nullable=False, default=730, server_default="730")
    campaign_daily_issue_cap = Column(Integer, nullable=False, default=500000, server_default="500000")
    max_promo_grant_points = Column(Integer, nullable=False, default=100000, server_default="100000")
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class LoyaltyWallet(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_wallets"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_loyalty_wallets_org_user"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    promo_balance = Column(Integer, nullable=False, default=0, server_default="0")
    earned_balance = Column(Integer, nullable=False, default=0, server_default="0")
    lifetime_earned_points = Column(Integer, nullable=False, default=0, server_default="0")
    tier = Column(String(32), nullable=False, default="Bronze", server_default="Bronze")


class LoyaltyCampaign(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_campaigns"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    campaign_type = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="draft", server_default="draft")
    rules_json = Column(JSON, nullable=False, default=dict)
    reward_json = Column(JSON, nullable=False, default=dict)
    budget_points = Column(Integer, nullable=True)
    issued_points = Column(Integer, nullable=False, default=0, server_default="0")
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class LoyaltyRedemptionLock(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_redemption_locks"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_loyalty_redemption_locks_idempotency_key"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(Integer, ForeignKey("loyalty_wallets.id", ondelete="RESTRICT"), nullable=False, index=True)
    priddy_wallet_id = Column(Integer, ForeignKey("priddy_points_wallets.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True, index=True)
    priddy_points = Column(Integer, nullable=False, default=0, server_default="0")
    promo_points = Column(Integer, nullable=False, default=0, server_default="0")
    earned_points = Column(Integer, nullable=False, default=0, server_default="0")
    points = Column(Integer, nullable=False, default=0, server_default="0")
    discount_cents = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(32), nullable=False, default="active", server_default="active")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    idempotency_key = Column(String(255), nullable=True, index=True)
    metadata_json = Column(JSON, nullable=False, default=dict)


class LoyaltyRedemption(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_redemptions"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(Integer, ForeignKey("loyalty_wallets.id", ondelete="RESTRICT"), nullable=False, index=True)
    priddy_wallet_id = Column(Integer, ForeignKey("priddy_points_wallets.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    redemption_lock_id = Column(Integer, ForeignKey("loyalty_redemption_locks.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    priddy_points = Column(Integer, nullable=False, default=0, server_default="0")
    promo_points = Column(Integer, nullable=False, default=0, server_default="0")
    earned_points = Column(Integer, nullable=False, default=0, server_default="0")
    points = Column(Integer, nullable=False, default=0, server_default="0")
    discount_cents = Column(Integer, nullable=False, default=0, server_default="0")
    status = Column(String(32), nullable=False, default="finalized", server_default="finalized")


class LoyaltyLedgerEntry(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "loyalty_ledger_entries"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_loyalty_ledger_entries_idempotency_key"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    wallet_id = Column(Integer, ForeignKey("loyalty_wallets.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    entry_type = Column(String(64), nullable=False)
    point_type = Column(String(32), nullable=False)
    points = Column(Integer, nullable=False)
    source = Column(String(64), nullable=False)
    source_public_id = Column(String(255), nullable=True)
    campaign_id = Column(Integer, ForeignKey("loyalty_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    redemption_id = Column(Integer, ForeignKey("loyalty_redemptions.id", ondelete="SET NULL"), nullable=True, index=True)
    redemption_lock_id = Column(Integer, ForeignKey("loyalty_redemption_locks.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    idempotency_key = Column(String(255), nullable=True, index=True)
    note = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=False, default=dict)


class PriddyPointsWallet(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "priddy_points_wallets"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_priddy_points_wallets_user"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    balance = Column(Integer, nullable=False, default=0, server_default="0")
    lifetime_earned_points = Column(Integer, nullable=False, default=0, server_default="0")


class PriddyPointsLedgerEntry(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "priddy_points_ledger_entries"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_priddy_points_ledger_entries_idempotency_key"),
    )

    id = Column(Integer, primary_key=True)
    wallet_id = Column(Integer, ForeignKey("priddy_points_wallets.id", ondelete="RESTRICT"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    entry_type = Column(String(64), nullable=False)
    points = Column(Integer, nullable=False)
    source = Column(String(64), nullable=False)
    source_public_id = Column(String(255), nullable=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    redemption_id = Column(Integer, ForeignKey("loyalty_redemptions.id", ondelete="SET NULL"), nullable=True, index=True)
    redemption_lock_id = Column(Integer, ForeignKey("loyalty_redemption_locks.id", ondelete="SET NULL"), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True, index=True)
    idempotency_key = Column(String(255), nullable=True, index=True)
    note = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=False, default=dict)
