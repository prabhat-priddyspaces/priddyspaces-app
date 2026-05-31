"""owner onboarding business details

Revision ID: 0047_owner_business_details
Revises: 0046_booking_reminder_push
Create Date: 2026-05-31
"""
from alembic import op
import sqlalchemy as sa


revision = "0047_owner_business_details"
down_revision = "0046_booking_reminder_push"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("display_name", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("business_email", sa.String(255), nullable=True))
    op.add_column("organizations", sa.Column("business_phone", sa.String(64), nullable=True))
    op.add_column("organizations", sa.Column("description", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("organizations", "description")
    op.drop_column("organizations", "business_phone")
    op.drop_column("organizations", "business_email")
    op.drop_column("organizations", "display_name")
