"""space setup fee items

Revision ID: 0049_space_setup_fee_items
Revises: 0048_owner_created_bookings
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa


revision = "0049_space_setup_fee_items"
down_revision = "0048_owner_created_bookings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "space_setup_fee_items",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("amount_cents", sa.Integer, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index(
        "ix_space_setup_fee_items_public_id",
        "space_setup_fee_items",
        ["public_id"],
        unique=True,
    )
    op.create_index(
        "ix_space_setup_fee_items_tenant_id",
        "space_setup_fee_items",
        ["tenant_id"],
    )
    op.create_index(
        "ix_space_setup_fee_items_space_id",
        "space_setup_fee_items",
        ["space_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_space_setup_fee_items_space_id", table_name="space_setup_fee_items")
    op.drop_index("ix_space_setup_fee_items_tenant_id", table_name="space_setup_fee_items")
    op.drop_index("ix_space_setup_fee_items_public_id", table_name="space_setup_fee_items")
    op.drop_table("space_setup_fee_items")
