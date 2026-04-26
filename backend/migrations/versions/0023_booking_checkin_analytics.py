"""booking check-in columns and analytics indices

Revision ID: 0023_booking_checkin_analytics
Revises: 0022_normalize_enum_values
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa


revision = "0023_booking_checkin_analytics"
down_revision = "0022_normalize_enum_values"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "bookings",
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "bookings",
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "bookings",
        sa.Column("no_show", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_index("ix_bookings_tenant_created_at", "bookings", ["tenant_id", "created_at"])
    op.create_index("ix_bookings_space_start", "bookings", ["space_id", "start_datetime"])
    op.create_index("ix_bookings_user_created_at", "bookings", ["user_id", "created_at"])
    op.create_index("ix_payments_tenant_created_at", "payments", ["tenant_id", "created_at"])


def downgrade():
    op.drop_index("ix_payments_tenant_created_at", table_name="payments")
    op.drop_index("ix_bookings_user_created_at", table_name="bookings")
    op.drop_index("ix_bookings_space_start", table_name="bookings")
    op.drop_index("ix_bookings_tenant_created_at", table_name="bookings")
    op.drop_column("bookings", "no_show")
    op.drop_column("bookings", "checked_out_at")
    op.drop_column("bookings", "checked_in_at")
