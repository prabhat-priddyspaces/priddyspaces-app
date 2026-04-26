"""pricing promo tax

Revision ID: 0011_pricing_promo_tax
Revises: 0010_booking_request_booking_id
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0011_pricing_promo_tax"
down_revision = "0010_booking_request_booking_id"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pricing_rules",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("rate_type", sa.String(16), nullable=False),
        sa.Column("rate_amount", sa.Integer, nullable=False),
        sa.Column("active_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_pricing_rules_public_id", "pricing_rules", ["public_id"], unique=True)

    op.create_table(
        "promo_codes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("discount_type", sa.String(16), nullable=False),
        sa.Column("discount_value", sa.Integer, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_promo_codes_public_id", "promo_codes", ["public_id"], unique=True)
    op.create_index("ix_promo_codes_code", "promo_codes", ["code"], unique=False)

    op.create_table(
        "tax_configs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False, unique=True),
        sa.Column("rate_percent", sa.Float, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_tax_configs_public_id", "tax_configs", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_tax_configs_public_id", table_name="tax_configs")
    op.drop_table("tax_configs")
    op.drop_index("ix_promo_codes_code", table_name="promo_codes")
    op.drop_index("ix_promo_codes_public_id", table_name="promo_codes")
    op.drop_table("promo_codes")
    op.drop_index("ix_pricing_rules_public_id", table_name="pricing_rules")
    op.drop_table("pricing_rules")
