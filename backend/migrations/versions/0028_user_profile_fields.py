"""user profile fields (phone, company_name)

Revision ID: 0028_user_profile_fields
Revises: 0027_org_customers
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0028_user_profile_fields"
down_revision = "0027_org_customers"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("phone", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("company_name", sa.String(255), nullable=True))


def downgrade():
    op.drop_column("users", "company_name")
    op.drop_column("users", "phone")
