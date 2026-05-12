"""instant booking inventory and payment ledger

Revision ID: 0035_instant_booking_inventory_payments
Revises: 0033_assistant_v1
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "0035_instant_booking_inventory_payments"
down_revision = "0033_assistant_v1"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    ]


def _public_id_column() -> sa.Column:
    return sa.Column("public_id", sa.String(36), nullable=True)


def upgrade() -> None:
    op.add_column("spaces", sa.Column("buffer_before_minutes", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("spaces", sa.Column("buffer_after_minutes", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "booking_series",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("space_id", sa.Integer(), nullable=False),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("recurrence_frequency", sa.String(16), nullable=False),
        sa.Column("recurrence_interval", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("occurrence_count", sa.Integer(), nullable=False),
        sa.Column("first_start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        *_timestamps(),
    )
    op.create_index("ix_booking_series_public_id", "booking_series", ["public_id"], unique=True)
    for col in ["tenant_id", "user_id", "space_id", "booking_request_id"]:
        op.create_index(f"ix_booking_series_{col}", "booking_series", [col])

    op.add_column("bookings", sa.Column("inventory_start_datetime", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("inventory_end_datetime", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("booking_series_id", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("booking_request_id", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("recurrence_sequence", sa.Integer(), nullable=True))
    op.create_index("ix_bookings_booking_series_id", "bookings", ["booking_series_id"])
    op.create_index("ix_bookings_booking_request_id", "bookings", ["booking_request_id"])
    op.create_index("ix_bookings_inventory_window", "bookings", ["space_id", "inventory_start_datetime", "inventory_end_datetime"])

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
        op.execute(
            """
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_no_active_inventory_overlap
            EXCLUDE USING gist (
                space_id WITH =,
                tstzrange(inventory_start_datetime, inventory_end_datetime, '[)') WITH &&
            )
            WHERE (
                status IN ('pending', 'confirmed')
                AND inventory_start_datetime IS NOT NULL
                AND inventory_end_datetime IS NOT NULL
            )
            """
        )

    op.add_column("booking_requests", sa.Column("booking_series_id", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("instant_booking", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("booking_requests", sa.Column("recurrence_frequency", sa.String(16), nullable=True))
    op.add_column("booking_requests", sa.Column("recurrence_interval", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("recurrence_count", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("recurrence_until_date", sa.Date(), nullable=True))
    op.add_column("booking_requests", sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("booking_requests", sa.Column("pricing_snapshot", sa.String(4096), nullable=True))
    op.add_column("booking_requests", sa.Column("refund_policy_snapshot", sa.String(4096), nullable=True))
    op.create_index("ix_booking_requests_booking_series_id", "booking_requests", ["booking_series_id"])

    op.add_column("payments", sa.Column("subtotal_cents", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("discount_cents", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("tax_cents", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("refunded_amount_cents", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("payments", sa.Column("booking_series_id", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("pricing_snapshot", sa.JSON(), nullable=True))
    op.add_column("payments", sa.Column("refund_policy_snapshot", sa.JSON(), nullable=True))
    op.create_index("ix_payments_booking_series_id", "payments", ["booking_series_id"])

    op.create_table(
        "payment_refunds",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("amount_cents", sa.Integer(), nullable=False),
        sa.Column("refund_percent", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("provider_refund_id", sa.String(255), nullable=True),
        sa.Column("provider_reference_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("failure_reason", sa.String(1024), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_payment_refunds_public_id", "payment_refunds", ["public_id"], unique=True)
    for col in ["tenant_id", "payment_id", "booking_id", "booking_request_id", "idempotency_key"]:
        op.create_index(f"ix_payment_refunds_{col}", "payment_refunds", [col])

    op.create_table(
        "cancellation_policy_tiers",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("cancellation_policy_id", sa.Integer(), nullable=False),
        sa.Column("min_hours_before_start", sa.Integer(), nullable=False),
        sa.Column("refund_percent", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
    )
    op.create_index("ix_cancellation_policy_tiers_public_id", "cancellation_policy_tiers", ["public_id"], unique=True)
    op.create_index(
        "ix_cancellation_policy_tiers_policy_id",
        "cancellation_policy_tiers",
        ["cancellation_policy_id"],
    )

    op.execute(
        """
        INSERT INTO cancellation_policy_tiers
            (public_id, cancellation_policy_id, min_hours_before_start, refund_percent, sort_order)
        SELECT NULL, id, cancel_window_hours, refund_percent, 0
        FROM cancellation_policies
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_active_inventory_overlap")

    op.drop_index("ix_cancellation_policy_tiers_policy_id", table_name="cancellation_policy_tiers")
    op.drop_index("ix_cancellation_policy_tiers_public_id", table_name="cancellation_policy_tiers")
    op.drop_table("cancellation_policy_tiers")

    for col in ["idempotency_key", "booking_request_id", "booking_id", "payment_id", "tenant_id"]:
        op.drop_index(f"ix_payment_refunds_{col}", table_name="payment_refunds")
    op.drop_index("ix_payment_refunds_public_id", table_name="payment_refunds")
    op.drop_table("payment_refunds")

    op.drop_index("ix_payments_booking_series_id", table_name="payments")
    op.drop_column("payments", "refund_policy_snapshot")
    op.drop_column("payments", "pricing_snapshot")
    op.drop_column("payments", "booking_series_id")
    op.drop_column("payments", "refunded_amount_cents")
    op.drop_column("payments", "tax_cents")
    op.drop_column("payments", "discount_cents")
    op.drop_column("payments", "subtotal_cents")

    op.drop_index("ix_booking_requests_booking_series_id", table_name="booking_requests")
    op.drop_column("booking_requests", "refund_policy_snapshot")
    op.drop_column("booking_requests", "pricing_snapshot")
    op.drop_column("booking_requests", "occurrence_count")
    op.drop_column("booking_requests", "recurrence_until_date")
    op.drop_column("booking_requests", "recurrence_count")
    op.drop_column("booking_requests", "recurrence_interval")
    op.drop_column("booking_requests", "recurrence_frequency")
    op.drop_column("booking_requests", "instant_booking")
    op.drop_column("booking_requests", "booking_series_id")

    op.drop_index("ix_bookings_inventory_window", table_name="bookings")
    op.drop_index("ix_bookings_booking_request_id", table_name="bookings")
    op.drop_index("ix_bookings_booking_series_id", table_name="bookings")
    op.drop_column("bookings", "recurrence_sequence")
    op.drop_column("bookings", "booking_request_id")
    op.drop_column("bookings", "booking_series_id")
    op.drop_column("bookings", "inventory_end_datetime")
    op.drop_column("bookings", "inventory_start_datetime")

    for col in ["booking_request_id", "space_id", "user_id", "tenant_id"]:
        op.drop_index(f"ix_booking_series_{col}", table_name="booking_series")
    op.drop_index("ix_booking_series_public_id", table_name="booking_series")
    op.drop_table("booking_series")

    op.drop_column("spaces", "buffer_after_minutes")
    op.drop_column("spaces", "buffer_before_minutes")
