"""default new organizations to pending review

Revision ID: 0042_org_review_default_pending
Revises: 0041_priddy_points_eligibility
Create Date: 2026-05-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0042_org_review_default_pending"
down_revision = "0041_priddy_points_eligibility"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "organizations",
        "review_status",
        existing_type=sa.String(length=32),
        server_default="pending",
    )


def downgrade() -> None:
    op.alter_column(
        "organizations",
        "review_status",
        existing_type=sa.String(length=32),
        server_default="approved",
    )
