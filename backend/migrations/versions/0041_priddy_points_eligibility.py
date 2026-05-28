"""priddy points and loyalty eligibility controls

Revision ID: 0041_priddy_points_eligibility
Revises: 0040_booking_request_rejected_at
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0041_priddy_points_eligibility"
down_revision = "0040_booking_request_rejected_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("platform_settings", sa.Column("priddy_points_enabled", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("platform_settings", sa.Column("priddy_signup_points", sa.Integer(), server_default="1000", nullable=False))
    op.add_column("platform_settings", sa.Column("priddy_point_value_cents", sa.Integer(), server_default="1", nullable=False))
    op.add_column("platform_settings", sa.Column("priddy_allowed_space_types", sa.JSON(), nullable=False, server_default='["shared_desk"]'))
    op.add_column("platform_settings", sa.Column("priddy_allowed_booking_modes", sa.JSON(), nullable=False, server_default='["day_pass"]'))

    op.add_column("loyalty_owner_settings", sa.Column("accepts_priddy_points", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("loyalty_owner_settings", sa.Column("owner_points_redemption_enabled", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("loyalty_owner_settings", sa.Column("allowed_space_types", sa.JSON(), nullable=False, server_default='["conference_room", "shared_desk", "virtual_office"]'))
    op.add_column("loyalty_owner_settings", sa.Column("allowed_booking_modes", sa.JSON(), nullable=False, server_default='["hourly", "day_pass"]'))
    op.execute("UPDATE loyalty_owner_settings SET earn_rate_bps = 1")
    op.alter_column("loyalty_owner_settings", "earn_rate_bps", server_default="1")
    op.execute("UPDATE loyalty_owner_settings SET max_redemption_percent = 100")
    op.alter_column("loyalty_owner_settings", "max_redemption_percent", server_default="100")

    op.add_column("spaces", sa.Column("priddy_points_enabled", sa.Boolean(), nullable=True))
    op.add_column("spaces", sa.Column("owner_points_enabled", sa.Boolean(), nullable=True))

    op.create_table(
        "priddy_points_wallets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("balance", sa.Integer(), server_default="0", nullable=False),
        sa.Column("lifetime_earned_points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_priddy_points_wallets_user"),
    )
    op.create_index("ix_priddy_points_wallets_public_id", "priddy_points_wallets", ["public_id"], unique=True)
    op.create_index("ix_priddy_points_wallets_user_id", "priddy_points_wallets", ["user_id"])

    op.create_table(
        "priddy_points_ledger_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=64), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("source_public_id", sa.String(length=255), nullable=True),
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
        sa.ForeignKeyConstraint(["wallet_id"], ["priddy_points_wallets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_priddy_points_ledger_entries_idempotency_key"),
    )
    op.create_index("ix_priddy_points_ledger_entries_public_id", "priddy_points_ledger_entries", ["public_id"], unique=True)
    for col in [
        "wallet_id",
        "user_id",
        "booking_request_id",
        "booking_id",
        "payment_id",
        "redemption_id",
        "redemption_lock_id",
        "expires_at",
        "idempotency_key",
    ]:
        op.create_index(f"ix_priddy_points_ledger_entries_{col}", "priddy_points_ledger_entries", [col])

    op.add_column("loyalty_redemption_locks", sa.Column("priddy_wallet_id", sa.Integer(), nullable=True))
    op.add_column("loyalty_redemption_locks", sa.Column("priddy_points", sa.Integer(), server_default="0", nullable=False))
    op.create_foreign_key(
        "fk_loyalty_redemption_locks_priddy_wallet_id",
        "loyalty_redemption_locks",
        "priddy_points_wallets",
        ["priddy_wallet_id"],
        ["id"],
    )
    op.create_index("ix_loyalty_redemption_locks_priddy_wallet_id", "loyalty_redemption_locks", ["priddy_wallet_id"])

    op.add_column("loyalty_redemptions", sa.Column("priddy_wallet_id", sa.Integer(), nullable=True))
    op.add_column("loyalty_redemptions", sa.Column("priddy_points", sa.Integer(), server_default="0", nullable=False))
    op.create_foreign_key(
        "fk_loyalty_redemptions_priddy_wallet_id",
        "loyalty_redemptions",
        "priddy_points_wallets",
        ["priddy_wallet_id"],
        ["id"],
    )
    op.create_index("ix_loyalty_redemptions_priddy_wallet_id", "loyalty_redemptions", ["priddy_wallet_id"])


def downgrade() -> None:
    op.drop_index("ix_loyalty_redemptions_priddy_wallet_id", table_name="loyalty_redemptions")
    op.drop_constraint("fk_loyalty_redemptions_priddy_wallet_id", "loyalty_redemptions", type_="foreignkey")
    op.drop_column("loyalty_redemptions", "priddy_points")
    op.drop_column("loyalty_redemptions", "priddy_wallet_id")

    op.drop_index("ix_loyalty_redemption_locks_priddy_wallet_id", table_name="loyalty_redemption_locks")
    op.drop_constraint("fk_loyalty_redemption_locks_priddy_wallet_id", "loyalty_redemption_locks", type_="foreignkey")
    op.drop_column("loyalty_redemption_locks", "priddy_points")
    op.drop_column("loyalty_redemption_locks", "priddy_wallet_id")

    op.drop_table("priddy_points_ledger_entries")
    op.drop_table("priddy_points_wallets")

    op.drop_column("spaces", "owner_points_enabled")
    op.drop_column("spaces", "priddy_points_enabled")

    op.drop_column("loyalty_owner_settings", "allowed_booking_modes")
    op.drop_column("loyalty_owner_settings", "allowed_space_types")
    op.drop_column("loyalty_owner_settings", "owner_points_redemption_enabled")
    op.drop_column("loyalty_owner_settings", "accepts_priddy_points")
    op.alter_column("loyalty_owner_settings", "earn_rate_bps", server_default="100")
    op.alter_column("loyalty_owner_settings", "max_redemption_percent", server_default="25")

    op.drop_column("platform_settings", "priddy_allowed_booking_modes")
    op.drop_column("platform_settings", "priddy_allowed_space_types")
    op.drop_column("platform_settings", "priddy_point_value_cents")
    op.drop_column("platform_settings", "priddy_signup_points")
    op.drop_column("platform_settings", "priddy_points_enabled")
