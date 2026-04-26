"""Add invoices table.

Revision ID: 0018_invoices
Revises: 0017_space_visibility_amenities
Create Date: 2026-01-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_invoices"
down_revision = "0017_space_visibility_amenities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="issued"),
        sa.Column("pdf_url", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_invoices_public_id", "invoices", ["public_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_invoices_public_id", table_name="invoices")
    op.drop_table("invoices")
