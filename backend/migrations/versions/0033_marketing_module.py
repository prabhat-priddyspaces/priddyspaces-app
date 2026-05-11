"""owner marketing module

Revision ID: 0033_marketing_module
Revises: 0032_clerk_onboarding_fields
Create Date: 2026-05-10
"""
from alembic import op
import sqlalchemy as sa


revision = "0033_marketing_module"
down_revision = "0032_clerk_onboarding_fields"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    ]


def _public_id_column() -> sa.Column:
    return sa.Column("public_id", sa.String(36), nullable=False)


def upgrade() -> None:
    op.add_column(
        "organizations",
        sa.Column("allowed_marketing_lanes", sa.String(255), server_default="shared,verified_sender", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("default_marketing_lane", sa.String(32), server_default="shared", nullable=False),
    )
    op.add_column("organizations", sa.Column("shared_daily_cap", sa.Integer(), server_default="500", nullable=False))
    op.add_column(
        "organizations",
        sa.Column("verified_sender_daily_cap", sa.Integer(), server_default="2000", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("allow_business_sender_overrides", sa.Boolean(), server_default=sa.true(), nullable=False),
    )

    op.create_table(
        "marketing_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column("category", sa.String(64), nullable=True),
        sa.Column("classification", sa.String(64), nullable=True),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_marketing_templates_public_id", "marketing_templates", ["public_id"], unique=True)
    op.create_index("ix_marketing_templates_organization_id", "marketing_templates", ["organization_id"])
    op.create_index("ix_marketing_templates_tenant_id", "marketing_templates", ["tenant_id"])

    op.create_table(
        "audience_segments",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("filters", sa.JSON(), nullable=False),
        sa.Column("preview_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_previewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_archived", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_audience_segments_public_id", "audience_segments", ["public_id"], unique=True)
    op.create_index("ix_audience_segments_organization_id", "audience_segments", ["organization_id"])
    op.create_index("ix_audience_segments_tenant_id", "audience_segments", ["tenant_id"])

    op.create_table(
        "marketing_campaigns",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("segment_id", sa.Integer(), nullable=True),
        sa.Column("snapshot_filters", sa.JSON(), nullable=True),
        sa.Column("sender_lane", sa.String(32), server_default="shared", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("canceled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("eligible_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("suppressed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("no_email_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("queued_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("delivered_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("opened_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("clicked_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("bounced_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("unsubscribed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_marketing_campaigns_public_id", "marketing_campaigns", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "template_id", "segment_id", "scheduled_at"]:
        op.create_index(f"ix_marketing_campaigns_{col}", "marketing_campaigns", [col])

    op.create_table(
        "campaign_recipients",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("campaign_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("status", sa.String(32), server_default="queued", nullable=False),
        sa.Column("suppression_reason", sa.String(64), nullable=True),
        sa.Column("rendered_subject", sa.String(255), nullable=True),
        sa.Column("rendered_html", sa.Text(), nullable=True),
        sa.Column("rendered_text", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("outbound_message_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("campaign_id", "user_id", name="uq_campaign_recipients_campaign_user"),
    )
    op.create_index("ix_campaign_recipients_public_id", "campaign_recipients", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "campaign_id", "user_id", "email", "provider_message_id", "outbound_message_id"]:
        op.create_index(f"ix_campaign_recipients_{col}", "campaign_recipients", [col])

    op.create_table(
        "outbound_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("campaign_id", sa.Integer(), nullable=True),
        sa.Column("campaign_recipient_id", sa.Integer(), nullable=True),
        sa.Column("workflow_id", sa.Integer(), nullable=True),
        sa.Column("workflow_run_id", sa.Integer(), nullable=True),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=True),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column("sender_lane", sa.String(32), nullable=False),
        sa.Column("from_email", sa.String(320), nullable=False),
        sa.Column("from_name", sa.String(255), nullable=True),
        sa.Column("provider", sa.String(64), server_default="sendgrid", nullable=False),
        sa.Column("provider_message_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), server_default="queued", nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("opens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("clicks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source", sa.String(64), server_default="campaign", nullable=False),
        sa.Column("source_context", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_outbound_messages_public_id", "outbound_messages", ["public_id"], unique=True)
    for col in [
        "organization_id",
        "tenant_id",
        "user_id",
        "campaign_id",
        "campaign_recipient_id",
        "workflow_id",
        "workflow_run_id",
        "template_id",
        "email",
        "provider_message_id",
        "status",
    ]:
        op.create_index(f"ix_outbound_messages_{col}", "outbound_messages", [col])

    op.create_table(
        "email_suppressions",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("reason", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("source", sa.String(64), server_default="manual", nullable=False),
        sa.Column("source_event_id", sa.String(255), nullable=True),
        sa.Column("resubscribed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("organization_id", "email", name="uq_email_suppressions_org_email"),
    )
    op.create_index("ix_email_suppressions_public_id", "email_suppressions", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "user_id", "email"]:
        op.create_index(f"ix_email_suppressions_{col}", "email_suppressions", [col])

    op.create_table(
        "workflow_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("graph", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), server_default="published", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("workflow_id", "version_number", name="uq_workflow_versions_workflow_number"),
    )
    op.create_index("ix_workflow_versions_public_id", "workflow_versions", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "workflow_id"]:
        op.create_index(f"ix_workflow_versions_{col}", "workflow_versions", [col])

    op.create_table(
        "workflows",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("graph", sa.JSON(), nullable=False),
        sa.Column("current_version_id", sa.Integer(), sa.ForeignKey("workflow_versions.id"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_workflows_public_id", "workflows", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id"]:
        op.create_index(f"ix_workflows_{col}", "workflows", [col])

    op.create_table(
        "workflow_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("workflow_version_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), server_default="running", nullable=False),
        sa.Column("current_node_id", sa.String(255), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("context", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_workflow_runs_public_id", "workflow_runs", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "workflow_id", "workflow_version_id", "user_id", "status", "next_run_at"]:
        op.create_index(f"ix_workflow_runs_{col}", "workflow_runs", [col])

    op.create_table(
        "workflow_run_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("workflow_id", sa.Integer(), nullable=False),
        sa.Column("workflow_run_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(255), nullable=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), server_default="completed", nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("data", sa.JSON(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_workflow_run_events_public_id", "workflow_run_events", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "workflow_id", "workflow_run_id"]:
        op.create_index(f"ix_workflow_run_events_{col}", "workflow_run_events", [col])

    op.create_table(
        "marketing_verified_senders",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("sendgrid_sender_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(32), server_default="pending", nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("organization_id", "email", name="uq_marketing_verified_senders_org_email"),
    )
    op.create_index("ix_marketing_verified_senders_public_id", "marketing_verified_senders", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "email"]:
        op.create_index(f"ix_marketing_verified_senders_{col}", "marketing_verified_senders", [col])

    op.create_table(
        "business_marketing_sender_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        _public_id_column(),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("default_sender_lane", sa.String(32), server_default="shared", nullable=False),
        sa.Column("verified_sender_id", sa.Integer(), nullable=True),
        sa.Column("shared_from_email", sa.String(320), nullable=True),
        sa.Column("shared_from_name", sa.String(255), nullable=True),
        sa.Column("quiet_hours_start", sa.String(8), nullable=True),
        sa.Column("quiet_hours_end", sa.String(8), nullable=True),
        sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("organization_id", name="uq_business_marketing_sender_settings_org"),
    )
    op.create_index("ix_business_marketing_sender_settings_public_id", "business_marketing_sender_settings", ["public_id"], unique=True)
    for col in ["organization_id", "tenant_id", "verified_sender_id"]:
        op.create_index(f"ix_business_marketing_sender_settings_{col}", "business_marketing_sender_settings", [col])


def downgrade() -> None:
    for table, indexes in [
        ("business_marketing_sender_settings", ["public_id", "organization_id", "tenant_id", "verified_sender_id"]),
        ("marketing_verified_senders", ["public_id", "organization_id", "tenant_id", "email"]),
        ("workflow_run_events", ["public_id", "organization_id", "tenant_id", "workflow_id", "workflow_run_id"]),
        ("workflow_runs", ["public_id", "organization_id", "tenant_id", "workflow_id", "workflow_version_id", "user_id", "status", "next_run_at"]),
        ("workflows", ["public_id", "organization_id", "tenant_id"]),
        ("workflow_versions", ["public_id", "organization_id", "tenant_id", "workflow_id"]),
        ("email_suppressions", ["public_id", "organization_id", "tenant_id", "user_id", "email"]),
        ("outbound_messages", ["public_id", "organization_id", "tenant_id", "user_id", "campaign_id", "campaign_recipient_id", "workflow_id", "workflow_run_id", "template_id", "email", "provider_message_id", "status"]),
        ("campaign_recipients", ["public_id", "organization_id", "tenant_id", "campaign_id", "user_id", "email", "provider_message_id", "outbound_message_id"]),
        ("marketing_campaigns", ["public_id", "organization_id", "tenant_id", "template_id", "segment_id", "scheduled_at"]),
        ("audience_segments", ["public_id", "organization_id", "tenant_id"]),
        ("marketing_templates", ["public_id", "organization_id", "tenant_id"]),
    ]:
        for index in indexes:
            op.drop_index(f"ix_{table}_{index}", table_name=table)
        op.drop_table(table)

    op.drop_column("organizations", "allow_business_sender_overrides")
    op.drop_column("organizations", "verified_sender_daily_cap")
    op.drop_column("organizations", "shared_daily_cap")
    op.drop_column("organizations", "default_marketing_lane")
    op.drop_column("organizations", "allowed_marketing_lanes")
