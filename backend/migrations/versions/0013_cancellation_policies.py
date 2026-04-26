"""cancellation policies

Revision ID: 0013_cancellation_policies
Revises: 0012_feature_flags
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0013_cancellation_policies"
down_revision = "0012_feature_flags"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cancellation_policies",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_type", sa.String(32), nullable=False),
        sa.Column("cancel_window_hours", sa.Integer, nullable=False, server_default="24"),
        sa.Column("refund_percent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_cancellation_policies_public_id", "cancellation_policies", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_cancellation_policies_public_id", table_name="cancellation_policies")
    op.drop_table("cancellation_policies")
