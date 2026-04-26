"""org stripe account

Revision ID: 0014_org_stripe_account
Revises: 0013_cancellation_policies
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0014_org_stripe_account"
down_revision = "0013_cancellation_policies"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("stripe_account_id", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("organizations", "stripe_account_id")
