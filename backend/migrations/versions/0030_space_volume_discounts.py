"""space volume discounts

Revision ID: 0030_space_volume_discounts
Revises: 0029_space_hourly_price
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0030_space_volume_discounts"
down_revision = "0029_space_hourly_price"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "space_volume_discounts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("min_hours", sa.Float, nullable=False),
        sa.Column("discount_percent", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index(
        "ix_space_volume_discounts_public_id",
        "space_volume_discounts",
        ["public_id"],
        unique=True,
    )
    op.create_index(
        "ix_space_volume_discounts_organization_id",
        "space_volume_discounts",
        ["organization_id"],
    )
    op.create_index(
        "ix_space_volume_discounts_space_id",
        "space_volume_discounts",
        ["space_id"],
    )


def downgrade():
    op.drop_index("ix_space_volume_discounts_space_id", table_name="space_volume_discounts")
    op.drop_index("ix_space_volume_discounts_organization_id", table_name="space_volume_discounts")
    op.drop_index("ix_space_volume_discounts_public_id", table_name="space_volume_discounts")
    op.drop_table("space_volume_discounts")
