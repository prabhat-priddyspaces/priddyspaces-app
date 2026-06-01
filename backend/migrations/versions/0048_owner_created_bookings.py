"""owner created bookings

Revision ID: 0048_owner_created_bookings
Revises: 0047_owner_business_details
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0048_owner_created_bookings"
down_revision = "0047_owner_business_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "booking_requests",
        sa.Column("source", sa.String(32), nullable=False, server_default="member"),
    )
    op.add_column("booking_requests", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("payment_collection_mode", sa.String(32), nullable=True))

    op.create_table(
        "booking_payment_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("booking_request_id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="sent"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_booking_payment_links_tenant_id", "booking_payment_links", ["tenant_id"])
    op.create_index(
        "ix_booking_payment_links_booking_request_id",
        "booking_payment_links",
        ["booking_request_id"],
    )
    op.create_index("ix_booking_payment_links_token_hash", "booking_payment_links", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_booking_payment_links_token_hash", table_name="booking_payment_links")
    op.drop_index("ix_booking_payment_links_booking_request_id", table_name="booking_payment_links")
    op.drop_index("ix_booking_payment_links_tenant_id", table_name="booking_payment_links")
    op.drop_table("booking_payment_links")
    op.drop_column("booking_requests", "payment_collection_mode")
    op.drop_column("booking_requests", "created_by_user_id")
    op.drop_column("booking_requests", "source")
