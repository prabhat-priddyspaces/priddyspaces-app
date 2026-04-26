"""location city

Revision ID: 0005_location_city
Revises: 0004_user_register_login_fields
Create Date: 2026-01-29

"""
from alembic import op
import sqlalchemy as sa

revision = "0005_location_city"
down_revision = "0004_user_register_login_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("locations", sa.Column("city", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("locations", "city")
