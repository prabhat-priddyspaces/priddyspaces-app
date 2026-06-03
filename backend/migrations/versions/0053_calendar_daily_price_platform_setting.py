"""calendar daily price platform setting

Revision ID: 0053_calendar_daily_price_platform_setting
Revises: 0052_booking_waitlist
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0053_calendar_daily_price_platform_setting"
down_revision = "0052_booking_waitlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column(
            "booking_calendar_daily_prices_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "booking_calendar_daily_prices_enabled")
