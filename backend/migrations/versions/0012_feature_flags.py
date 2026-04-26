"""feature flags

Revision ID: 0012_feature_flags
Revises: 0011_pricing_promo_tax
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0012_feature_flags"
down_revision = "0011_pricing_promo_tax"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "feature_flags",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("flag_key", sa.String(64), nullable=False),
        sa.Column("flag_value", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("scope_type", sa.String(16), nullable=False),
        sa.Column("scope_id", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_feature_flags_public_id", "feature_flags", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_feature_flags_public_id", table_name="feature_flags")
    op.drop_table("feature_flags")
