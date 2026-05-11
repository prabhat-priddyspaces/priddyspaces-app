"""assistant v1

Revision ID: 0033_assistant_v1
Revises: 0034_guest_checkout
Create Date: 2026-05-11
"""

from alembic import op
import sqlalchemy as sa


revision = "0033_assistant_v1"
down_revision = "0034_guest_checkout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=128), nullable=True),
        sa.Column("audience", sa.String(length=32), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("organization_id", sa.Integer(), nullable=True),
        sa.Column("accessible_location_ids", sa.JSON(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("escalation_state", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_conversations_public_id", "assistant_conversations", ["public_id"], unique=True)
    op.create_index("ix_assistant_conversations_user_id", "assistant_conversations", ["user_id"])
    op.create_index("ix_assistant_conversations_guest_id", "assistant_conversations", ["guest_id"])
    op.create_index("ix_assistant_conversations_tenant_id", "assistant_conversations", ["tenant_id"])
    op.create_index("ix_assistant_conversations_organization_id", "assistant_conversations", ["organization_id"])

    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tool_calls", sa.JSON(), nullable=True),
        sa.Column("citations", sa.JSON(), nullable=True),
        sa.Column("proposals", sa.JSON(), nullable=True),
        sa.Column("usage", sa.JSON(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("redaction_counts", sa.JSON(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_messages_public_id", "assistant_messages", ["public_id"], unique=True)
    op.create_index("ix_assistant_messages_conversation_id", "assistant_messages", ["conversation_id"])

    op.create_table(
        "assistant_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=128), nullable=True),
        sa.Column("rating", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_feedback_public_id", "assistant_feedback", ["public_id"], unique=True)
    op.create_index("ix_assistant_feedback_conversation_id", "assistant_feedback", ["conversation_id"])
    op.create_index("ix_assistant_feedback_message_id", "assistant_feedback", ["message_id"])
    op.create_index("ix_assistant_feedback_user_id", "assistant_feedback", ["user_id"])
    op.create_index("ix_assistant_feedback_guest_id", "assistant_feedback", ["guest_id"])

    op.create_table(
        "assistant_rate_limits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("audience", sa.String(length=32), nullable=False),
        sa.Column("window_type", sa.String(length=16), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_rate_limits_public_id", "assistant_rate_limits", ["public_id"], unique=True)
    op.create_index("ix_assistant_rate_limits_identifier", "assistant_rate_limits", ["identifier"])
    op.create_index("ix_assistant_rate_limits_audience", "assistant_rate_limits", ["audience"])
    op.create_index("ix_assistant_rate_limits_window_start", "assistant_rate_limits", ["window_start"])

    op.create_table(
        "support_tickets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=128), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("requester_email", sa.String(length=255), nullable=True),
        sa.Column("transcript", sa.JSON(), nullable=True),
        sa.Column("event_metadata", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_support_tickets_public_id", "support_tickets", ["public_id"], unique=True)
    op.create_index("ix_support_tickets_conversation_id", "support_tickets", ["conversation_id"])
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_index("ix_support_tickets_guest_id", "support_tickets", ["guest_id"])
    op.create_index("ix_support_tickets_tenant_id", "support_tickets", ["tenant_id"])

    op.create_table(
        "space_alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.String(length=128), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=True),
        sa.Column("search_filters", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("matched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_space_alerts_public_id", "space_alerts", ["public_id"], unique=True)
    op.create_index("ix_space_alerts_user_id", "space_alerts", ["user_id"])
    op.create_index("ix_space_alerts_guest_id", "space_alerts", ["guest_id"])
    op.create_index("ix_space_alerts_tenant_id", "space_alerts", ["tenant_id"])

    op.create_table(
        "owner_policy_kb",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("space_id", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=1024), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_owner_policy_kb_public_id", "owner_policy_kb", ["public_id"], unique=True)
    op.create_index("ix_owner_policy_kb_tenant_id", "owner_policy_kb", ["tenant_id"])
    op.create_index("ix_owner_policy_kb_organization_id", "owner_policy_kb", ["organization_id"])
    op.create_index("ix_owner_policy_kb_location_id", "owner_policy_kb", ["location_id"])
    op.create_index("ix_owner_policy_kb_space_id", "owner_policy_kb", ["space_id"])
    op.create_index("ix_owner_policy_kb_category", "owner_policy_kb", ["category"])
    op.create_index("ix_owner_policy_kb_updated_by_user_id", "owner_policy_kb", ["updated_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_owner_policy_kb_updated_by_user_id", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_category", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_space_id", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_location_id", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_organization_id", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_tenant_id", table_name="owner_policy_kb")
    op.drop_index("ix_owner_policy_kb_public_id", table_name="owner_policy_kb")
    op.drop_table("owner_policy_kb")
    op.drop_index("ix_space_alerts_tenant_id", table_name="space_alerts")
    op.drop_index("ix_space_alerts_guest_id", table_name="space_alerts")
    op.drop_index("ix_space_alerts_user_id", table_name="space_alerts")
    op.drop_index("ix_space_alerts_public_id", table_name="space_alerts")
    op.drop_table("space_alerts")
    op.drop_index("ix_support_tickets_tenant_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_guest_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_user_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_conversation_id", table_name="support_tickets")
    op.drop_index("ix_support_tickets_public_id", table_name="support_tickets")
    op.drop_table("support_tickets")
    op.drop_index("ix_assistant_rate_limits_window_start", table_name="assistant_rate_limits")
    op.drop_index("ix_assistant_rate_limits_audience", table_name="assistant_rate_limits")
    op.drop_index("ix_assistant_rate_limits_identifier", table_name="assistant_rate_limits")
    op.drop_index("ix_assistant_rate_limits_public_id", table_name="assistant_rate_limits")
    op.drop_table("assistant_rate_limits")
    op.drop_index("ix_assistant_feedback_guest_id", table_name="assistant_feedback")
    op.drop_index("ix_assistant_feedback_user_id", table_name="assistant_feedback")
    op.drop_index("ix_assistant_feedback_message_id", table_name="assistant_feedback")
    op.drop_index("ix_assistant_feedback_conversation_id", table_name="assistant_feedback")
    op.drop_index("ix_assistant_feedback_public_id", table_name="assistant_feedback")
    op.drop_table("assistant_feedback")
    op.drop_index("ix_assistant_messages_conversation_id", table_name="assistant_messages")
    op.drop_index("ix_assistant_messages_public_id", table_name="assistant_messages")
    op.drop_table("assistant_messages")
    op.drop_index("ix_assistant_conversations_organization_id", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_tenant_id", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_guest_id", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_user_id", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_public_id", table_name="assistant_conversations")
    op.drop_table("assistant_conversations")
