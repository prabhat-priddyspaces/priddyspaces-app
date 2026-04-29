"""org customers (owner-scoped CRM)

Revision ID: 0027_org_customers
Revises: 0026_membership_purchase_flow
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0027_org_customers"
down_revision = "0026_membership_purchase_flow"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "org_customers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("tags", sa.String(1024), nullable=True),
        sa.Column("phone", sa.String(64), nullable=True),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_customers_org_user"),
    )
    op.create_index("ix_org_customers_public_id", "org_customers", ["public_id"], unique=True)
    op.create_index("ix_org_customers_organization_id", "org_customers", ["organization_id"])
    op.create_index("ix_org_customers_user_id", "org_customers", ["user_id"])


def downgrade():
    op.drop_index("ix_org_customers_user_id", table_name="org_customers")
    op.drop_index("ix_org_customers_organization_id", table_name="org_customers")
    op.drop_index("ix_org_customers_public_id", table_name="org_customers")
    op.drop_table("org_customers")
