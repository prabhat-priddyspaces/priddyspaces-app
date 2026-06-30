"""Create the super-admin-managed space_types registry and seed built-ins.

Seeds the five existing space types plus two new ones (event_space,
business_address). The ``key`` column holds the string already stored on
spaces.space_type, so the follow-up migration can convert that column and add
the foreign key without a data backfill.

Revision ID: 0060_create_space_types_registry
Revises: 0059_user_preferences
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

from app.services.space_archetypes import SYSTEM_SPACE_TYPES
from app.utils.uuid import new_public_id


revision = "0060_create_space_types_registry"
down_revision = "0059_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "space_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=36), nullable=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("icon", sa.String(length=64), nullable=True),
        sa.Column("archetype", sa.String(length=32), nullable=False),
        sa.Column("marketplace_category", sa.String(length=32), nullable=True),
        sa.Column("capacity_applicable", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("has_physical_inventory", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_space_types_public_id", "space_types", ["public_id"], unique=True)
    op.create_unique_constraint("uq_space_types_key", "space_types", ["key"])
    op.create_index("ix_space_types_key", "space_types", ["key"])
    op.create_index("ix_space_types_sort_order", "space_types", ["sort_order"])

    space_types = sa.table(
        "space_types",
        sa.column("public_id", sa.String),
        sa.column("key", sa.String),
        sa.column("label", sa.String),
        sa.column("description", sa.String),
        sa.column("icon", sa.String),
        sa.column("archetype", sa.String),
        sa.column("marketplace_category", sa.String),
        sa.column("capacity_applicable", sa.Boolean),
        sa.column("has_physical_inventory", sa.Boolean),
        sa.column("is_enabled", sa.Boolean),
        sa.column("sort_order", sa.Integer),
        sa.column("is_system", sa.Boolean),
    )
    op.bulk_insert(
        space_types,
        [{"public_id": new_public_id(), **spec} for spec in SYSTEM_SPACE_TYPES],
    )


def downgrade() -> None:
    op.drop_index("ix_space_types_sort_order", table_name="space_types")
    op.drop_index("ix_space_types_key", table_name="space_types")
    op.drop_constraint("uq_space_types_key", "space_types", type_="unique")
    op.drop_index("ix_space_types_public_id", table_name="space_types")
    op.drop_table("space_types")
