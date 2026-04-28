"""owner scoped deferred payments

Revision ID: 0024_owner_scoped_payments
Revises: 0023_booking_checkin_analytics
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0024_owner_scoped_payments"
down_revision = "0023_booking_checkin_analytics"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "owner_payment_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_test_mode", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("stripe_publishable_key", sa.String(255), nullable=True),
        sa.Column("stripe_secret_key_encrypted", sa.String(4096), nullable=True),
        sa.Column("stripe_webhook_secret_encrypted", sa.String(4096), nullable=True),
        sa.Column("cardpointe_merchant_id", sa.String(255), nullable=True),
        sa.Column("cardpointe_username_encrypted", sa.String(4096), nullable=True),
        sa.Column("cardpointe_password_encrypted", sa.String(4096), nullable=True),
        sa.Column("cardpointe_site", sa.String(512), nullable=True),
        sa.Column("cardpointe_tokenizer_url", sa.String(1024), nullable=True),
        sa.Column("connection_status", sa.String(32), nullable=False, server_default="not_tested"),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_owner_payment_settings_public_id", "owner_payment_settings", ["public_id"], unique=True)
    op.create_index("ix_owner_payment_settings_org_provider", "owner_payment_settings", ["organization_id", "provider"], unique=True)

    op.create_table(
        "customer_owner_payment_methods",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("owner_payment_setting_id", sa.Integer, nullable=False),
        sa.Column("provider_customer_id", sa.String(255), nullable=True),
        sa.Column("provider_payment_method_id", sa.String(255), nullable=True),
        sa.Column("card_token", sa.String(1024), nullable=True),
        sa.Column("last4", sa.String(4), nullable=True),
        sa.Column("brand", sa.String(64), nullable=True),
        sa.Column("exp_month", sa.Integer, nullable=True),
        sa.Column("exp_year", sa.Integer, nullable=True),
        sa.Column("is_default_for_owner", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("billing_name", sa.String(255), nullable=True),
        sa.Column("billing_zip", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_customer_owner_payment_methods_public_id", "customer_owner_payment_methods", ["public_id"], unique=True)
    op.create_index(
        "ix_customer_owner_payment_methods_scope",
        "customer_owner_payment_methods",
        ["user_id", "organization_id", "provider", "owner_payment_setting_id"],
    )

    op.add_column("organizations", sa.Column("payment_provider", sa.String(32), nullable=True))
    op.add_column("locations", sa.Column("payment_provider", sa.String(32), nullable=True))

    op.add_column("booking_requests", sa.Column("owner_payment_setting_id", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("payment_provider", sa.String(32), nullable=True))
    op.add_column("booking_requests", sa.Column("customer_owner_payment_method_id", sa.Integer(), nullable=True))
    op.add_column("booking_requests", sa.Column("payment_status", sa.String(32), nullable=True))
    op.add_column("booking_requests", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("booking_requests", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("booking_requests", sa.Column("cancellation_deadline_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("booking_requests", sa.Column("payment_authorization_consent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "booking_requests",
        sa.Column("payment_attempt_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column("payments", sa.Column("booking_request_id", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("amount_cents", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("currency", sa.String(3), nullable=False, server_default="usd"))
    op.add_column("payments", sa.Column("payment_method_id", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("provider_payment_id", sa.String(255), nullable=True))
    op.add_column("payments", sa.Column("provider_reference_id", sa.String(255), nullable=True))
    op.add_column("payments", sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("payments", sa.Column("idempotency_key", sa.String(255), nullable=True))
    op.add_column("payments", sa.Column("failure_reason", sa.String(1024), nullable=True))
    op.add_column("payments", sa.Column("raw_response", sa.JSON(), nullable=True))
    op.create_index("ix_payments_booking_request_id", "payments", ["booking_request_id"])
    op.create_index("ix_payments_idempotency_key", "payments", ["idempotency_key"], unique=True)


def downgrade():
    op.drop_index("ix_payments_idempotency_key", table_name="payments")
    op.drop_index("ix_payments_booking_request_id", table_name="payments")
    op.drop_column("payments", "raw_response")
    op.drop_column("payments", "failure_reason")
    op.drop_column("payments", "idempotency_key")
    op.drop_column("payments", "attempt_number")
    op.drop_column("payments", "provider_reference_id")
    op.drop_column("payments", "provider_payment_id")
    op.drop_column("payments", "payment_method_id")
    op.drop_column("payments", "currency")
    op.drop_column("payments", "amount_cents")
    op.drop_column("payments", "booking_request_id")

    op.drop_column("booking_requests", "payment_attempt_count")
    op.drop_column("booking_requests", "payment_authorization_consent_at")
    op.drop_column("booking_requests", "cancellation_deadline_at")
    op.drop_column("booking_requests", "cancelled_at")
    op.drop_column("booking_requests", "approved_at")
    op.drop_column("booking_requests", "payment_status")
    op.drop_column("booking_requests", "customer_owner_payment_method_id")
    op.drop_column("booking_requests", "payment_provider")
    op.drop_column("booking_requests", "owner_payment_setting_id")

    op.drop_column("locations", "payment_provider")
    op.drop_column("organizations", "payment_provider")

    op.drop_index("ix_customer_owner_payment_methods_scope", table_name="customer_owner_payment_methods")
    op.drop_index("ix_customer_owner_payment_methods_public_id", table_name="customer_owner_payment_methods")
    op.drop_table("customer_owner_payment_methods")

    op.drop_index("ix_owner_payment_settings_org_provider", table_name="owner_payment_settings")
    op.drop_index("ix_owner_payment_settings_public_id", table_name="owner_payment_settings")
    op.drop_table("owner_payment_settings")
