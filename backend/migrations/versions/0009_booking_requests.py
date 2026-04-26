"""booking requests

Revision ID: 0009_booking_requests
Revises: 0008_location_geo
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0009_booking_requests"
down_revision = "0008_location_geo"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "booking_requests",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="requested"),
        sa.Column("operator_notes", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_booking_requests_public_id", "booking_requests", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_booking_requests_public_id", table_name="booking_requests")
    op.drop_table("booking_requests")
