"""owner promo redemption

Revision ID: 0054_owner_promo_redemption
Revises: 0054_per_space_type_waitlist
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0054_owner_promo_redemption"
down_revision = "0054_per_space_type_waitlist"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("promo_codes", sa.Column("description", sa.String(length=1024), nullable=True))
    op.add_column("promo_codes", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("promo_codes", sa.Column("max_redemptions", sa.Integer(), nullable=True))
    op.add_column("promo_codes", sa.Column("max_redemptions_per_member", sa.Integer(), nullable=True))
    op.add_column(
        "promo_codes",
        sa.Column("total_redemptions", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("UPDATE promo_codes SET code = upper(trim(code))")
    op.execute("UPDATE promo_codes SET expires_at = ends_at WHERE expires_at IS NULL AND ends_at IS NOT NULL")
    op.create_unique_constraint("uq_promo_codes_tenant_code", "promo_codes", ["tenant_id", "code"])

    op.create_table(
        "booking_promotions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("booking_id", sa.Integer(), nullable=True),
        sa.Column("booking_request_id", sa.Integer(), nullable=True),
        sa.Column("promo_code_id", sa.Integer(), nullable=False),
        sa.Column("promo_code_snapshot", sa.JSON(), nullable=False),
        sa.Column("discount_amount", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_booking_promotions_public_id", "booking_promotions", ["public_id"], unique=True)
    op.create_index("ix_booking_promotions_booking_id", "booking_promotions", ["booking_id"])
    op.create_index("ix_booking_promotions_booking_request_id", "booking_promotions", ["booking_request_id"])
    op.create_index("ix_booking_promotions_promo_code_id", "booking_promotions", ["promo_code_id"])


def downgrade() -> None:
    op.drop_index("ix_booking_promotions_promo_code_id", table_name="booking_promotions")
    op.drop_index("ix_booking_promotions_booking_request_id", table_name="booking_promotions")
    op.drop_index("ix_booking_promotions_booking_id", table_name="booking_promotions")
    op.drop_index("ix_booking_promotions_public_id", table_name="booking_promotions")
    op.drop_table("booking_promotions")
    op.drop_constraint("uq_promo_codes_tenant_code", "promo_codes", type_="unique")
    op.drop_column("promo_codes", "total_redemptions")
    op.drop_column("promo_codes", "max_redemptions_per_member")
    op.drop_column("promo_codes", "max_redemptions")
    op.drop_column("promo_codes", "expires_at")
    op.drop_column("promo_codes", "description")
