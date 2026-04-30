"""space hourly price

Revision ID: 0029_space_hourly_price
Revises: 0028_user_profile_fields
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0029_space_hourly_price"
down_revision = "0028_user_profile_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("spaces", sa.Column("price_hourly", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("spaces", "price_hourly")
