"""location geo fields

Revision ID: 0008_location_geo
Revises: 0007_space_images
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0008_location_geo"
down_revision = "0007_space_images"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("locations", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("locations", sa.Column("lng", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("locations", "lng")
    op.drop_column("locations", "lat")
