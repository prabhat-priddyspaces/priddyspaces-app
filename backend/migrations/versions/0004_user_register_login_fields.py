"""user register and login fields

Revision ID: 0004_user_register_login_fields
Revises: 0003_user_auth_stripe_fields
Create Date: 2026-01-29

"""
from alembic import op
import sqlalchemy as sa

revision = "0004_user_register_login_fields"
down_revision = "0003_user_auth_stripe_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("first_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("privacy_policy_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "privacy_policy_accepted_at")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "role")
    op.drop_column("users", "last_name")
    op.drop_column("users", "first_name")
    op.drop_column("users", "password_hash")
