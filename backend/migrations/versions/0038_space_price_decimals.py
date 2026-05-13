"""space price decimals

Revision ID: 0038_space_price_decimals
Revises: 0037_location_working_hours
Create Date: 2026-05-13
"""

from alembic import op
import sqlalchemy as sa


revision = "0038_space_price_decimals"
down_revision = "0037_location_working_hours"
branch_labels = None
depends_on = None


def upgrade():
    for column in ("price_monthly", "price_daily", "price_hourly"):
        op.alter_column(
            "spaces",
            column,
            existing_type=sa.Integer(),
            type_=sa.Numeric(12, 2),
            existing_nullable=True,
            postgresql_using=f"{column}::numeric(12, 2)",
        )


def downgrade():
    for column in ("price_monthly", "price_daily", "price_hourly"):
        op.alter_column(
            "spaces",
            column,
            existing_type=sa.Numeric(12, 2),
            type_=sa.Integer(),
            existing_nullable=True,
            postgresql_using=f"round({column})::integer",
        )
