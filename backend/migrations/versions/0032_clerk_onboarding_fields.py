"""clerk org id and onboarding_completed flag

Revision ID: 0032_clerk_onboarding_fields
Revises: 0031_email_events
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa

revision = "0032_clerk_onboarding_fields"
down_revision = "0031_email_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Store Clerk org ID for webhook idempotency
    op.add_column(
        "organizations",
        sa.Column("clerk_org_id", sa.String(255), nullable=True, unique=True),
    )
    op.create_index("ix_organizations_clerk_org_id", "organizations", ["clerk_org_id"])

    # Gate flag: set to true once owner completes org onboarding
    op.add_column(
        "organizations",
        sa.Column("onboarding_completed", sa.Boolean(), server_default=sa.false(), nullable=False),
    )

    # Onboarding profile fields
    op.add_column("organizations", sa.Column("industry", sa.String(128), nullable=True))
    op.add_column("organizations", sa.Column("size", sa.String(32), nullable=True))
    op.add_column("organizations", sa.Column("website", sa.String(512), nullable=True))

    # Store Clerk membership ID for idempotent upserts on membership events
    op.add_column(
        "organization_members",
        sa.Column("clerk_membership_id", sa.String(255), nullable=True, unique=True),
    )
    op.create_index("ix_org_members_clerk_membership_id", "organization_members", ["clerk_membership_id"])


def downgrade() -> None:
    op.drop_index("ix_org_members_clerk_membership_id", table_name="organization_members")
    op.drop_column("organization_members", "clerk_membership_id")
    op.drop_column("organizations", "website")
    op.drop_column("organizations", "size")
    op.drop_column("organizations", "industry")
    op.drop_index("ix_organizations_clerk_org_id", table_name="organizations")
    op.drop_column("organizations", "onboarding_completed")
    op.drop_column("organizations", "clerk_org_id")
