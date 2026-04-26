"""Add availability hours to spaces.

Revision ID: 0016_space_availability_hours
Revises: 0015_subscription_plan_fields
Create Date: 2026-01-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0016_space_availability_hours"
down_revision = "0015_subscription_plan_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("spaces", sa.Column("availability_start_time", sa.Time(), nullable=True))
    op.add_column("spaces", sa.Column("availability_end_time", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("spaces", "availability_end_time")
    op.drop_column("spaces", "availability_start_time")
