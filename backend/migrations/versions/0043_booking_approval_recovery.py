"""organization booking approval and payment recovery settings

Revision ID: 0043_booking_approval_recovery
Revises: 0042_org_review_default_pending
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0043_booking_approval_recovery"
down_revision = "0042_org_review_default_pending"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column(
            "booking_approval_mode",
            sa.String(length=16),
            nullable=False,
            server_default="manual",
        ),
    )
    op.add_column(
        "organizations",
        sa.Column(
            "payment_failure_hold_minutes",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
    )
    op.add_column(
        "booking_requests",
        sa.Column("payment_hold_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "booking_requests",
        sa.Column("payment_failed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_booking_requests_payment_hold_expires_at",
        "booking_requests",
        ["payment_hold_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_booking_requests_payment_hold_expires_at", table_name="booking_requests")
    op.drop_column("booking_requests", "payment_failed_at")
    op.drop_column("booking_requests", "payment_hold_expires_at")
    op.drop_column("organizations", "payment_failure_hold_minutes")
    op.drop_column("organizations", "booking_approval_mode")
