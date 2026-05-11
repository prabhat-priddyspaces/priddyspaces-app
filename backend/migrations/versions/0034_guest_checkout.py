"""guest checkout fields on booking_requests

Revision ID: 0034_guest_checkout
Revises: 0033_marketing_module
Create Date: 2026-05-11
"""
from alembic import op
import sqlalchemy as sa


revision = "0034_guest_checkout"
down_revision = "0033_marketing_module"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("booking_requests", sa.Column("is_guest_checkout", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("booking_requests", sa.Column("guest_email", sa.String(255), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_full_name", sa.String(255), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_phone", sa.String(64), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_company_name", sa.String(255), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_notes", sa.String(1024), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_token", sa.String(64), nullable=True))
    op.add_column("booking_requests", sa.Column("guest_token_expires_at", sa.DateTime(timezone=True), nullable=True))

    # user_id was NOT NULL; make it nullable to allow guest requests without a user account
    op.alter_column("booking_requests", "user_id", nullable=True)

    op.create_unique_constraint("uq_booking_requests_guest_token", "booking_requests", ["guest_token"])


def downgrade() -> None:
    op.drop_constraint("uq_booking_requests_guest_token", "booking_requests", type_="unique")
    op.alter_column("booking_requests", "user_id", nullable=False)
    op.drop_column("booking_requests", "guest_token_expires_at")
    op.drop_column("booking_requests", "guest_token")
    op.drop_column("booking_requests", "guest_notes")
    op.drop_column("booking_requests", "guest_company_name")
    op.drop_column("booking_requests", "guest_phone")
    op.drop_column("booking_requests", "guest_full_name")
    op.drop_column("booking_requests", "guest_email")
    op.drop_column("booking_requests", "is_guest_checkout")
