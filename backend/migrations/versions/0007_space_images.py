"""space images

Revision ID: 0007_space_images
Revises: 0006_add_tenant_id
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0007_space_images"
down_revision = "0006_add_tenant_id"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "space_images",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("image_url", sa.String(1024), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column("is_primary", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_space_images_public_id", "space_images", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_space_images_public_id", table_name="space_images")
    op.drop_table("space_images")
