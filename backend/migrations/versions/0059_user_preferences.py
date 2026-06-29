"""user preferences (theme family + mode)

Revision ID: 0059_user_preferences
Revises: 0058_remove_legacy_subscription_plans
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0059_user_preferences"
down_revision = "0058_remove_legacy_subscription_plans"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("theme_family", sa.String(32), nullable=False, server_default="neutral"),
        sa.Column("theme_mode", sa.String(16), nullable=False, server_default="system"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_preferences_public_id", "user_preferences", ["public_id"], unique=True)
    op.create_index("ix_user_preferences_user_id", "user_preferences", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_preferences_user_id", table_name="user_preferences")
    op.drop_index("ix_user_preferences_public_id", table_name="user_preferences")
    op.drop_table("user_preferences")
