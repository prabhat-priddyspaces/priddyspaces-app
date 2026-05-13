"""owner booking email preferences

Revision ID: 0039_booking_email_prefs
Revises: 0038_space_price_decimals
Create Date: 2026-05-13
"""
from alembic import op
import sqlalchemy as sa


revision = "0039_booking_email_prefs"
down_revision = "0038_space_price_decimals"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "organization_members",
        sa.Column(
            "receives_new_booking_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.execute(
        """
        UPDATE organization_members
        SET receives_new_booking_email = true
        WHERE role IN ('owner', 'admin')
        """
    )


def downgrade():
    op.drop_column("organization_members", "receives_new_booking_email")
