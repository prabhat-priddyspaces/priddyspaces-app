"""per space type waitlist settings

Revision ID: 0054_per_space_type_waitlist
Revises: 0053_calendar_daily_price_platform_setting
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0054_per_space_type_waitlist"
down_revision = "0053_calendar_daily_price_platform_setting"
branch_labels = None
depends_on = None


WAITLIST_COLUMNS = [
    "waitlist_conference_room_enabled",
    "waitlist_private_office_enabled",
    "waitlist_shared_desk_enabled",
    "waitlist_suite_enabled",
    "waitlist_virtual_office_enabled",
]


def upgrade() -> None:
    for column in WAITLIST_COLUMNS:
        op.add_column(
            "organizations",
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    op.execute(
        """
        UPDATE organizations
        SET
            waitlist_conference_room_enabled = waitlist_enabled,
            waitlist_private_office_enabled = waitlist_enabled,
            waitlist_shared_desk_enabled = waitlist_enabled,
            waitlist_suite_enabled = waitlist_enabled,
            waitlist_virtual_office_enabled = waitlist_enabled
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE organizations
        SET waitlist_enabled = (
            waitlist_conference_room_enabled
            OR waitlist_private_office_enabled
            OR waitlist_shared_desk_enabled
            OR waitlist_suite_enabled
            OR waitlist_virtual_office_enabled
        )
        """
    )
    for column in reversed(WAITLIST_COLUMNS):
        op.drop_column("organizations", column)
