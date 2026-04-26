"""Add platform admin, organization review, and commission snapshot fields.

Revision ID: 0021_platform_admin_superadmin
Revises: 0020_marketplace_listing_details
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_platform_admin_superadmin"
down_revision = "0020_marketplace_listing_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_team_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("invited_by", sa.Integer(), nullable=True),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index(
        "ix_platform_team_members_public_id",
        "platform_team_members",
        ["public_id"],
        unique=True,
    )
    op.create_index(
        "ix_platform_team_members_user_id",
        "platform_team_members",
        ["user_id"],
        unique=True,
    )

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("default_owner_commission_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_platform_settings_public_id", "platform_settings", ["public_id"], unique=True)

    op.add_column(
        "organizations",
        sa.Column("review_status", sa.String(length=32), nullable=False, server_default="approved"),
    )
    op.add_column("organizations", sa.Column("review_notes", sa.String(length=2048), nullable=True))
    op.add_column("organizations", sa.Column("reviewed_by_user_id", sa.Integer(), nullable=True))
    op.add_column("organizations", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("organizations", sa.Column("commission_override_pct", sa.Integer(), nullable=True))

    op.add_column("payments", sa.Column("commission_rate_pct", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("platform_fee_amount", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("owner_net_amount", sa.Integer(), nullable=True))

    op.add_column("invoices", sa.Column("commission_rate_pct", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("platform_fee_amount", sa.Float(), nullable=True))
    op.add_column("invoices", sa.Column("owner_net_amount", sa.Float(), nullable=True))

    op.add_column("audit_logs", sa.Column("acting_as_user_id", sa.Integer(), nullable=True))
    op.add_column("audit_logs", sa.Column("context", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("audit_logs", "context")
    op.drop_column("audit_logs", "acting_as_user_id")

    op.drop_column("invoices", "owner_net_amount")
    op.drop_column("invoices", "platform_fee_amount")
    op.drop_column("invoices", "commission_rate_pct")

    op.drop_column("payments", "owner_net_amount")
    op.drop_column("payments", "platform_fee_amount")
    op.drop_column("payments", "commission_rate_pct")

    op.drop_column("organizations", "commission_override_pct")
    op.drop_column("organizations", "reviewed_at")
    op.drop_column("organizations", "reviewed_by_user_id")
    op.drop_column("organizations", "review_notes")
    op.drop_column("organizations", "review_status")

    op.drop_index("ix_platform_settings_public_id", table_name="platform_settings")
    op.drop_table("platform_settings")

    op.drop_index("ix_platform_team_members_user_id", table_name="platform_team_members")
    op.drop_index("ix_platform_team_members_public_id", table_name="platform_team_members")
    op.drop_table("platform_team_members")
