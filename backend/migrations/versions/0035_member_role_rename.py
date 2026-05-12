"""rename customer role and records to member

Revision ID: 0035_member_role_rename
Revises: 0033_assistant_v1
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa


revision = "0035_member_role_rename"
down_revision = "0033_assistant_v1"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE users SET email = lower(trim(email))")
    op.execute("UPDATE users SET role = 'member' WHERE role = 'customer'")
    op.execute("UPDATE organization_members SET role = 'member' WHERE role = 'customer'")

    op.create_index(
        "ix_users_email_lower_unique",
        "users",
        [sa.text("lower(email)")],
        unique=True,
    )

    op.rename_table("customer_owner_payment_methods", "member_owner_payment_methods")
    op.execute(
        "ALTER INDEX IF EXISTS ix_customer_owner_payment_methods_public_id "
        "RENAME TO ix_member_owner_payment_methods_public_id"
    )
    op.execute(
        "ALTER INDEX IF EXISTS ix_customer_owner_payment_methods_scope "
        "RENAME TO ix_member_owner_payment_methods_scope"
    )
    op.alter_column(
        "booking_requests",
        "customer_owner_payment_method_id",
        new_column_name="member_owner_payment_method_id",
        existing_type=sa.Integer(),
        nullable=True,
    )

    op.rename_table("org_customers", "org_member_profiles")
    op.execute("ALTER INDEX IF EXISTS ix_org_customers_public_id RENAME TO ix_org_member_profiles_public_id")
    op.execute("ALTER INDEX IF EXISTS ix_org_customers_organization_id RENAME TO ix_org_member_profiles_organization_id")
    op.execute("ALTER INDEX IF EXISTS ix_org_customers_user_id RENAME TO ix_org_member_profiles_user_id")
    op.execute(
        "ALTER TABLE org_member_profiles RENAME CONSTRAINT uq_org_customers_org_user "
        "TO uq_org_member_profiles_org_user"
    )


def downgrade():
    op.execute(
        "ALTER TABLE org_member_profiles RENAME CONSTRAINT uq_org_member_profiles_org_user "
        "TO uq_org_customers_org_user"
    )
    op.execute("ALTER INDEX IF EXISTS ix_org_member_profiles_user_id RENAME TO ix_org_customers_user_id")
    op.execute(
        "ALTER INDEX IF EXISTS ix_org_member_profiles_organization_id "
        "RENAME TO ix_org_customers_organization_id"
    )
    op.execute("ALTER INDEX IF EXISTS ix_org_member_profiles_public_id RENAME TO ix_org_customers_public_id")
    op.rename_table("org_member_profiles", "org_customers")

    op.alter_column(
        "booking_requests",
        "member_owner_payment_method_id",
        new_column_name="customer_owner_payment_method_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.execute(
        "ALTER INDEX IF EXISTS ix_member_owner_payment_methods_scope "
        "RENAME TO ix_customer_owner_payment_methods_scope"
    )
    op.execute(
        "ALTER INDEX IF EXISTS ix_member_owner_payment_methods_public_id "
        "RENAME TO ix_customer_owner_payment_methods_public_id"
    )
    op.rename_table("member_owner_payment_methods", "customer_owner_payment_methods")

    op.drop_index("ix_users_email_lower_unique", table_name="users")
    op.execute("UPDATE organization_members SET role = 'customer' WHERE role = 'member'")
    op.execute("UPDATE users SET role = 'customer' WHERE role = 'member'")
