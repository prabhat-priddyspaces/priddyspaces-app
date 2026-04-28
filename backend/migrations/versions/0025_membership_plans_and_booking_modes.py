"""membership plans and per-space booking modes

Revision ID: 0025_membership_plans
Revises: 0024_owner_scoped_payments
Create Date: 2026-04-28
"""
import uuid

from alembic import op
import sqlalchemy as sa


revision = "0025_membership_plans"
down_revision = "0024_owner_scoped_payments"
branch_labels = None
depends_on = None




def upgrade():
    op.create_table(
        "space_booking_modes",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("booking_mode", sa.String(32), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("space_id", "booking_mode", name="uq_space_booking_modes_space_mode"),
    )
    op.create_index("ix_space_booking_modes_public_id", "space_booking_modes", ["public_id"], unique=True)
    op.create_index("ix_space_booking_modes_space_id", "space_booking_modes", ["space_id"])

    op.create_table(
        "membership_plans",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("tenant_id", sa.Integer, nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("booking_mode", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.String(1024), nullable=True),
        sa.Column("price_cents", sa.Integer, nullable=False),
        sa.Column("billing_cycle", sa.String(32), nullable=False, server_default="monthly"),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column("commitment_months", sa.Integer, nullable=True),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "included_meeting_room_hours_per_month",
            sa.Integer,
            nullable=False,
            server_default="0",
        ),
        sa.Column("overage_hourly_rate_cents", sa.Integer, nullable=True),
        sa.Column("seats_per_plan", sa.Integer, nullable=False, server_default="1"),
        sa.Column("max_active_subscriptions", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_membership_plans_public_id", "membership_plans", ["public_id"], unique=True)
    op.create_index("ix_membership_plans_space_id", "membership_plans", ["space_id"])
    op.create_index("ix_membership_plans_tenant_id", "membership_plans", ["tenant_id"])

    # Backfill space_booking_modes from existing space data so the new join doesn't drop
    # spaces from public listings until owners explicitly configure modes.
    bind = op.get_bind()

    def _backfill(where_clause: str, booking_mode: str) -> None:
        rows = bind.execute(
            sa.text(f"SELECT id, tenant_id FROM spaces WHERE {where_clause}")
        ).fetchall()
        if not rows:
            return
        bind.execute(
            sa.text(
                """
                INSERT INTO space_booking_modes
                    (public_id, tenant_id, space_id, booking_mode, is_enabled, created_at, updated_at)
                VALUES
                    (:public_id, :tenant_id, :space_id, :booking_mode, true, now(), now())
                """
            ),
            [
                {
                    "public_id": str(uuid.uuid4()),
                    "tenant_id": row.tenant_id,
                    "space_id": row.id,
                    "booking_mode": booking_mode,
                }
                for row in rows
            ],
        )

    _backfill("space_type = 'conference_room'", "hourly")
    _backfill("space_type = 'shared_desk' AND price_daily IS NOT NULL", "day_pass")
    _backfill(
        """
        space_type = 'shared_desk'
        AND EXISTS (
            SELECT 1 FROM subscription_plans sp
            WHERE sp.tenant_id = spaces.tenant_id
              AND sp.space_type = 'shared_desk'
              AND sp.is_active = true
        )
        """,
        "monthly_membership",
    )
    _backfill(
        "space_type = 'private_office' AND price_monthly IS NOT NULL",
        "private_office_lease",
    )
    _backfill("space_type = 'virtual_office'", "virtual_membership")


def downgrade():
    op.drop_index("ix_membership_plans_tenant_id", table_name="membership_plans")
    op.drop_index("ix_membership_plans_space_id", table_name="membership_plans")
    op.drop_index("ix_membership_plans_public_id", table_name="membership_plans")
    op.drop_table("membership_plans")

    op.drop_index("ix_space_booking_modes_space_id", table_name="space_booking_modes")
    op.drop_index("ix_space_booking_modes_public_id", table_name="space_booking_modes")
    op.drop_table("space_booking_modes")
