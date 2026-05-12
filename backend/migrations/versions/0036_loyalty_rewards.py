"""owner scoped loyalty rewards

Revision ID: 0036_loyalty_rewards
Revises: 0035_member_role_rename
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "0036_loyalty_rewards"
down_revision = "0035_member_role_rename"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "loyalty_owner_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("point_value_cents", sa.Integer(), server_default="1", nullable=False),
        sa.Column("earn_rate_bps", sa.Integer(), server_default="100", nullable=False),
        sa.Column("max_redemption_percent", sa.Integer(), server_default="25", nullable=False),
        sa.Column("promo_expiration_days", sa.Integer(), server_default="180", nullable=False),
        sa.Column("earned_expiration_days", sa.Integer(), server_default="730", nullable=False),
        sa.Column("campaign_daily_issue_cap", sa.Integer(), server_default="500000", nullable=False),
        sa.Column("max_promo_grant_points", sa.Integer(), server_default="100000", nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_loyalty_owner_settings_org"),
    )
    op.create_index("ix_loyalty_owner_settings_public_id", "loyalty_owner_settings", ["public_id"], unique=True)
    op.create_index("ix_loyalty_owner_settings_organization_id", "loyalty_owner_settings", ["organization_id"])
    op.create_index("ix_loyalty_owner_settings_tenant_id", "loyalty_owner_settings", ["tenant_id"])

    op.create_table(
        "loyalty_wallets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("promo_balance", sa.Integer(), server_default="0", nullable=False),
        sa.Column("earned_balance", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lifetime_earned_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tier", sa.String(length=32), server_default="Bronze", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_loyalty_wallets_org_user"),
    )
    op.create_index("ix_loyalty_wallets_public_id", "loyalty_wallets", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "user_id"]:
        op.create_index(f"ix_loyalty_wallets_{col}", "loyalty_wallets", [col])

    op.create_table(
        "loyalty_campaigns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("campaign_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="draft", nullable=False),
        sa.Column("rules_json", sa.JSON(), nullable=False),
        sa.Column("reward_json", sa.JSON(), nullable=False),
        sa.Column("budget_points", sa.Integer(), nullable=True),
        sa.Column("issued_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loyalty_campaigns_public_id", "loyalty_campaigns", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id"]:
        op.create_index(f"ix_loyalty_campaigns_{col}", "loyalty_campaigns", [col])

    op.create_table(
        "loyalty_redemption_locks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("space_id", sa.Integer(), nullable=True),
        sa.Column("promo_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("earned_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("discount_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["wallet_id"], ["loyalty_wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_loyalty_redemption_locks_idempotency_key"),
    )
    op.create_index("ix_loyalty_redemption_locks_public_id", "loyalty_redemption_locks", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "wallet_id", "user_id", "booking_request_id", "space_id", "idempotency_key"]:
        op.create_index(f"ix_loyalty_redemption_locks_{col}", "loyalty_redemption_locks", [col])

    op.create_table(
        "loyalty_redemptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("redemption_lock_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("promo_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("earned_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("discount_cents", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="finalized", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["redemption_lock_id"], ["loyalty_redemption_locks.id"]),
        sa.ForeignKeyConstraint(["wallet_id"], ["loyalty_wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_loyalty_redemptions_public_id", "loyalty_redemptions", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "wallet_id", "user_id", "redemption_lock_id", "booking_request_id", "booking_id", "payment_id"]:
        op.create_index(f"ix_loyalty_redemptions_{col}", "loyalty_redemptions", [col])

    op.create_table(
        "loyalty_ledger_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=64), nullable=False),
        sa.Column("point_type", sa.String(length=32), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_public_id", sa.String(length=255), nullable=True),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("redemption_id", sa.Integer(), nullable=True),
        sa.Column("redemption_lock_id", sa.Integer(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["wallet_id"], ["loyalty_wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_loyalty_ledger_entries_idempotency_key"),
    )
    op.create_index("ix_loyalty_ledger_entries_public_id", "loyalty_ledger_entries", ["public_id"], unique=True)
    for col in [
        "organization_id",
        "tenant_id",
        "wallet_id",
        "user_id",
        "campaign_id",
        "booking_request_id",
        "booking_id",
        "payment_id",
        "redemption_id",
        "redemption_lock_id",
        "expires_at",
        "idempotency_key",
    ]:
        op.create_index(f"ix_loyalty_ledger_entries_{col}", "loyalty_ledger_entries", [col])

    op.add_column("booking_requests", sa.Column("loyalty_redemption_lock_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("booking_requests", "loyalty_redemption_lock_id")
    op.drop_table("loyalty_ledger_entries")
    op.drop_table("loyalty_redemptions")
    op.drop_table("loyalty_redemption_locks")
    op.drop_table("loyalty_campaigns")
    op.drop_table("loyalty_wallets")
    op.drop_table("loyalty_owner_settings")
