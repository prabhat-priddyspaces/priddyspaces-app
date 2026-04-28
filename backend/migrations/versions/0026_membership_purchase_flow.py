"""membership purchase flow + ledger

Revision ID: 0026_membership_purchase_flow
Revises: 0025_membership_plans
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0026_membership_purchase_flow"
down_revision = "0025_membership_plans"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "booking_requests",
        sa.Column(
            "request_kind",
            sa.String(32),
            nullable=False,
            server_default="hourly_booking",
        ),
    )
    op.add_column("booking_requests", sa.Column("membership_plan_id", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("desired_start_date", sa.Date(), nullable=True))
    op.add_column(
        "booking_requests",
        sa.Column("seats_requested", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "booking_requests",
        sa.Column("commitment_months_snapshot", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_booking_requests_request_kind", "booking_requests", ["request_kind"]
    )
    op.create_index(
        "ix_booking_requests_membership_plan_id",
        "booking_requests",
        ["membership_plan_id"],
    )

    op.add_column("subscriptions", sa.Column("membership_plan_id", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("booking_mode", sa.String(32), nullable=True))
    op.add_column("subscriptions", sa.Column("commitment_months", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("commitment_start_date", sa.Date(), nullable=True))
    op.add_column("subscriptions", sa.Column("commitment_end_date", sa.Date(), nullable=True))
    op.add_column(
        "subscriptions",
        sa.Column(
            "included_meeting_room_hours_per_month",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "subscriptions",
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "ix_subscriptions_membership_plan_id", "subscriptions", ["membership_plan_id"]
    )

    op.create_table(
        "meeting_room_hour_ledger",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("subscription_id", sa.Integer, nullable=False),
        sa.Column("booking_id", sa.Integer, nullable=True),
        sa.Column("billing_period_start", sa.Date, nullable=False),
        sa.Column("billing_period_end", sa.Date, nullable=False),
        sa.Column("entry_type", sa.String(32), nullable=False),
        sa.Column("hours_delta_minutes", sa.Integer, nullable=False),
        sa.Column("description", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index(
        "ix_meeting_room_hour_ledger_public_id",
        "meeting_room_hour_ledger",
        ["public_id"],
        unique=True,
    )
    op.create_index(
        "ix_meeting_room_hour_ledger_subscription_period",
        "meeting_room_hour_ledger",
        ["subscription_id", "billing_period_start"],
    )


def downgrade():
    op.drop_index(
        "ix_meeting_room_hour_ledger_subscription_period",
        table_name="meeting_room_hour_ledger",
    )
    op.drop_index(
        "ix_meeting_room_hour_ledger_public_id", table_name="meeting_room_hour_ledger"
    )
    op.drop_table("meeting_room_hour_ledger")

    op.drop_index("ix_subscriptions_membership_plan_id", table_name="subscriptions")
    op.drop_column("subscriptions", "auto_renew")
    op.drop_column("subscriptions", "included_meeting_room_hours_per_month")
    op.drop_column("subscriptions", "commitment_end_date")
    op.drop_column("subscriptions", "commitment_start_date")
    op.drop_column("subscriptions", "commitment_months")
    op.drop_column("subscriptions", "booking_mode")
    op.drop_column("subscriptions", "membership_plan_id")

    op.drop_index("ix_booking_requests_membership_plan_id", table_name="booking_requests")
    op.drop_index("ix_booking_requests_request_kind", table_name="booking_requests")
    op.drop_column("booking_requests", "commitment_months_snapshot")
    op.drop_column("booking_requests", "seats_requested")
    op.drop_column("booking_requests", "desired_start_date")
    op.drop_column("booking_requests", "membership_plan_id")
    op.drop_column("booking_requests", "request_kind")
