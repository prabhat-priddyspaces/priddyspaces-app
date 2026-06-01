"""booking waitlist

Revision ID: 0052_booking_waitlist
Revises: 0051_membership_lease_approval_mode
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0052_booking_waitlist"
down_revision = "0051_membership_lease_approval_mode"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("waitlist_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "booking_waitlist_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("membership_plan_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("request_kind", sa.String(32), nullable=False, server_default="hourly_booking"),
        sa.Column("booking_mode", sa.String(32), nullable=True),
        sa.Column("full_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("seats_requested", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("desired_start_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="waitlisted"),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("booked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("operator_notes", sa.String(1024), nullable=True),
        *_timestamps(),
    )
    for col in [
        "public_id",
        "tenant_id",
        "organization_id",
        "location_id",
        "space_id",
        "user_id",
        "membership_plan_id",
        "booking_request_id",
        "status",
    ]:
        op.create_index(
            f"ix_booking_waitlist_entries_{col}",
            "booking_waitlist_entries",
            [col],
            unique=col == "public_id",
        )


def downgrade() -> None:
    for col in [
        "status",
        "booking_request_id",
        "membership_plan_id",
        "user_id",
        "space_id",
        "location_id",
        "organization_id",
        "tenant_id",
        "public_id",
    ]:
        op.drop_index(f"ix_booking_waitlist_entries_{col}", table_name="booking_waitlist_entries")
    op.drop_table("booking_waitlist_entries")
    op.drop_column("organizations", "waitlist_enabled")
