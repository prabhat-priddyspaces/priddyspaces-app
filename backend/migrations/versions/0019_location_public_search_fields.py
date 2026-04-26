"""Add public marketplace location fields.

Revision ID: 0019_public_location_fields
Revises: 0019_org_location_amenities
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_public_location_fields"
down_revision = "0019_org_location_amenities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("locations", sa.Column("state", sa.String(length=128), nullable=True))
    op.add_column("locations", sa.Column("postal_code", sa.String(length=32), nullable=True))
    op.add_column("locations", sa.Column("neighborhood", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("locations", "neighborhood")
    op.drop_column("locations", "postal_code")
    op.drop_column("locations", "state")
