"""Add space visibility and amenities.

Revision ID: 0017_space_visibility_amenities
Revises: 0016_space_availability_hours
Create Date: 2026-01-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_space_visibility_amenities"
down_revision = "0016_space_availability_hours"
branch_labels = None
depends_on = None


def upgrade() -> None:
    space_visibility = sa.Enum("public", "unlisted", "private", name="spacevisibility")
    space_visibility.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "spaces",
        sa.Column("visibility", space_visibility, nullable=False, server_default="public")
    )
    op.add_column("spaces", sa.Column("amenities", sa.String(length=1024), nullable=True))
    op.alter_column("spaces", "visibility", server_default=None)


def downgrade() -> None:
    op.drop_column("spaces", "amenities")
    op.drop_column("spaces", "visibility")
    sa.Enum(name="spacevisibility").drop(op.get_bind(), checkfirst=True)
