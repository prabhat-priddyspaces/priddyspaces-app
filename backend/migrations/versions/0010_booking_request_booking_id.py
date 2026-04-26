"""booking_request booking_id

Revision ID: 0010_booking_request_booking_id
Revises: 0009_booking_requests
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0010_booking_request_booking_id"
down_revision = "0009_booking_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("booking_requests", sa.Column("booking_id", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("booking_requests", "booking_id")
