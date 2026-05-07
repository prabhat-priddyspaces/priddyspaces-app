"""email events and unsubscribe tracking

Revision ID: 0031_email_events
Revises: 0030_space_volume_discounts
Create Date: 2026-05-07
"""
from alembic import op
import sqlalchemy as sa


revision = "0031_email_events"
down_revision = "0030_space_volume_discounts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "email_events",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("sg_event_id", sa.String(255), nullable=False),
        sa.Column("sg_message_id", sa.String(255), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("status", sa.String(64), nullable=True),
        sa.Column("response", sa.Text, nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("asm_group_id", sa.Integer, nullable=True),
        sa.Column("sg_event_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", sa.JSON, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=True),
        sa.Column("tenant_id", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("sg_event_id"),
    )
    op.create_index("ix_email_events_public_id", "email_events", ["public_id"], unique=True)
    op.create_index("ix_email_events_sg_event_id", "email_events", ["sg_event_id"], unique=True)
    op.create_index("ix_email_events_sg_message_id", "email_events", ["sg_message_id"])
    op.create_index("ix_email_events_email", "email_events", ["email"])
    op.create_index("ix_email_events_event_type", "email_events", ["event_type"])
    op.create_index("ix_email_events_user_id", "email_events", ["user_id"])
    op.create_index("ix_email_events_tenant_id", "email_events", ["tenant_id"])
    op.create_index("ix_email_events_email_event_type", "email_events", ["email", "event_type"])

    op.create_table(
        "email_subscription_groups",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.Integer, nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("asm_group_id", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("source_event_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("email", "asm_group_id", name="uq_email_subscription_groups_email_group"),
    )
    op.create_index(
        "ix_email_subscription_groups_public_id",
        "email_subscription_groups",
        ["public_id"],
        unique=True,
    )
    op.create_index("ix_email_subscription_groups_user_id", "email_subscription_groups", ["user_id"])
    op.create_index("ix_email_subscription_groups_email", "email_subscription_groups", ["email"])

    op.add_column(
        "users",
        sa.Column("email_unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("email_unsubscribe_reason", sa.String(64), nullable=True),
    )


def downgrade():
    op.drop_column("users", "email_unsubscribe_reason")
    op.drop_column("users", "email_unsubscribed_at")

    op.drop_index("ix_email_subscription_groups_email", table_name="email_subscription_groups")
    op.drop_index("ix_email_subscription_groups_user_id", table_name="email_subscription_groups")
    op.drop_index("ix_email_subscription_groups_public_id", table_name="email_subscription_groups")
    op.drop_table("email_subscription_groups")

    op.drop_index("ix_email_events_email_event_type", table_name="email_events")
    op.drop_index("ix_email_events_tenant_id", table_name="email_events")
    op.drop_index("ix_email_events_user_id", table_name="email_events")
    op.drop_index("ix_email_events_event_type", table_name="email_events")
    op.drop_index("ix_email_events_email", table_name="email_events")
    op.drop_index("ix_email_events_sg_message_id", table_name="email_events")
    op.drop_index("ix_email_events_sg_event_id", table_name="email_events")
    op.drop_index("ix_email_events_public_id", table_name="email_events")
    op.drop_table("email_events")
