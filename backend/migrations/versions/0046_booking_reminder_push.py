"""booking reminder push notifications

Revision ID: 0046_booking_reminder_push
Revises: 0045_space_access_passes
Create Date: 2026-05-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0046_booking_reminder_push"
down_revision = "0045_space_access_passes"
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
    op.add_column(
        "organization_members",
        sa.Column("receives_booking_start_push", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.add_column(
        "organization_members",
        sa.Column("receives_booking_end_push", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("endpoint_hash", sa.String(128), nullable=False),
        sa.Column("subscription_encrypted", sa.String(4096), nullable=False),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(1024), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_push_subscriptions_public_id", "push_subscriptions", ["public_id"], unique=True)
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])
    op.create_index("ix_push_subscriptions_tenant_id", "push_subscriptions", ["tenant_id"])
    op.create_index("ix_push_subscriptions_provider", "push_subscriptions", ["provider"])
    op.create_index("ix_push_subscriptions_endpoint_hash", "push_subscriptions", ["endpoint_hash"], unique=True)
    op.create_index("ix_push_subscriptions_is_active", "push_subscriptions", ["is_active"])

    op.create_table(
        "user_notifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("space_id", sa.Integer(), nullable=True),
        sa.Column("audience", sa.String(32), nullable=False),
        sa.Column("reminder_type", sa.String(32), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link_url", sa.String(1024), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("push_status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("push_attempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("push_error", sa.String(1024), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("user_id", "booking_id", "reminder_type", "audience", name="uq_user_notifications_booking_reminder"),
    )
    for col in [
        "public_id",
        "user_id",
        "tenant_id",
        "organization_id",
        "booking_id",
        "booking_request_id",
        "location_id",
        "space_id",
        "audience",
        "reminder_type",
        "is_read",
        "push_status",
    ]:
        op.create_index(
            f"ix_user_notifications_{col}",
            "user_notifications",
            [col],
            unique=col == "public_id",
        )

    op.create_table(
        "user_notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("booking_start_push_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("booking_end_push_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
    )
    op.create_index("ix_user_notification_preferences_public_id", "user_notification_preferences", ["public_id"], unique=True)
    op.create_index("ix_user_notification_preferences_user_id", "user_notification_preferences", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_notification_preferences_user_id", table_name="user_notification_preferences")
    op.drop_index("ix_user_notification_preferences_public_id", table_name="user_notification_preferences")
    op.drop_table("user_notification_preferences")

    for col in [
        "push_status",
        "is_read",
        "reminder_type",
        "audience",
        "space_id",
        "location_id",
        "booking_request_id",
        "booking_id",
        "organization_id",
        "tenant_id",
        "user_id",
        "public_id",
    ]:
        op.drop_index(f"ix_user_notifications_{col}", table_name="user_notifications")
    op.drop_table("user_notifications")

    for index_name in [
        "ix_push_subscriptions_is_active",
        "ix_push_subscriptions_endpoint_hash",
        "ix_push_subscriptions_provider",
        "ix_push_subscriptions_tenant_id",
        "ix_push_subscriptions_user_id",
        "ix_push_subscriptions_public_id",
    ]:
        op.drop_index(index_name, table_name="push_subscriptions")
    op.drop_table("push_subscriptions")

    op.drop_column("organization_members", "receives_booking_end_push")
    op.drop_column("organization_members", "receives_booking_start_push")
