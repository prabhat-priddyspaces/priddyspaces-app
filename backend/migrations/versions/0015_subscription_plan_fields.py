"""Add subscription plan fields.

Revision ID: 0015_subscription_plan_fields
Revises: 0014_org_stripe_account
Create Date: 2026-01-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_subscription_plan_fields"
down_revision = "0014_org_stripe_account"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_plans", sa.Column("name", sa.String(length=120), nullable=True))
    op.add_column("subscription_plans", sa.Column("stripe_price_id", sa.String(length=255), nullable=True))
    op.add_column(
        "subscription_plans",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())
    )

    op.execute("UPDATE subscription_plans SET name = 'Membership' WHERE name IS NULL")
    op.alter_column("subscription_plans", "name", nullable=False)
    op.alter_column("subscription_plans", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_column("subscription_plans", "is_active")
    op.drop_column("subscription_plans", "stripe_price_id")
    op.drop_column("subscription_plans", "name")
