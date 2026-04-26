"""user auth and stripe fields

Revision ID: 0003_user_auth_stripe_fields
Revises: 0002_payment_events
Create Date: 2026-01-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0003_user_auth_stripe_fields"
down_revision = "0002_payment_events"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("auth_subject", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_customer_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("stripe_default_payment_method_id", sa.String(255), nullable=True))
    op.create_index("ix_users_auth_subject", "users", ["auth_subject"], unique=True)


def downgrade():
    op.drop_index("ix_users_auth_subject", table_name="users")
    op.drop_column("users", "stripe_default_payment_method_id")
    op.drop_column("users", "stripe_customer_id")
    op.drop_column("users", "auth_subject")
