"""Add public marketplace listing detail fields.

Revision ID: 0020_marketplace_listing_details
Revises: 0019_public_location_fields
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_marketplace_listing_details"
down_revision = "0019_public_location_fields"
branch_labels = None
depends_on = None


def _titleize_space_type(value: str | None) -> str:
    if not value:
        return "Space"
    return " ".join(part.capitalize() for part in value.split("_"))


def upgrade() -> None:
    op.add_column("spaces", sa.Column("name", sa.String(length=255), nullable=True))

    op.add_column("locations", sa.Column("public_phone", sa.String(length=255), nullable=True))
    op.add_column("locations", sa.Column("public_email", sa.String(length=255), nullable=True))
    op.add_column("locations", sa.Column("public_hours_weekdays", sa.String(length=255), nullable=True))
    op.add_column("locations", sa.Column("public_hours_weekends", sa.String(length=255), nullable=True))
    op.add_column("locations", sa.Column("public_parking_notes", sa.String(length=2048), nullable=True))
    op.add_column("locations", sa.Column("public_transit_notes", sa.String(length=2048), nullable=True))
    op.add_column("locations", sa.Column("public_included_items", sa.String(length=2048), nullable=True))

    conn = op.get_bind()
    spaces = sa.table(
        "spaces",
        sa.column("id", sa.Integer()),
        sa.column("space_type", sa.String()),
        sa.column("name", sa.String()),
    )
    rows = conn.execute(
        sa.select(spaces.c.id, spaces.c.space_type).where(
            sa.or_(spaces.c.name.is_(None), spaces.c.name == "")
        )
    ).fetchall()
    for row in rows:
        conn.execute(
            spaces.update()
            .where(spaces.c.id == row.id)
            .values(name=_titleize_space_type(row.space_type))
        )


def downgrade() -> None:
    op.drop_column("locations", "public_included_items")
    op.drop_column("locations", "public_transit_notes")
    op.drop_column("locations", "public_parking_notes")
    op.drop_column("locations", "public_hours_weekends")
    op.drop_column("locations", "public_hours_weekdays")
    op.drop_column("locations", "public_email")
    op.drop_column("locations", "public_phone")
    op.drop_column("spaces", "name")
