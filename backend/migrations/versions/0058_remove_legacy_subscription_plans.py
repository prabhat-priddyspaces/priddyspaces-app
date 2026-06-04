"""remove legacy subscription plans

Revision ID: 0058_remove_legacy_subscription_plans
Revises: 0057_validate_fk_constraints
Create Date: 2026-06-04
"""
import uuid

from alembic import op
import sqlalchemy as sa


revision = "0058_remove_legacy_subscription_plans"
down_revision = "0057_validate_fk_constraints"
branch_labels = None
depends_on = None


BOOKING_MODE_BY_SPACE_TYPE = {
    "shared_desk": "monthly_membership",
    "virtual_office": "virtual_membership",
    "private_office": "private_office_lease",
    "suite": "suite_lease",
}

COMMITMENT_MONTHS_BY_BILLING_CYCLE = {
    "monthly": 1,
    "quarterly": 3,
    "six_month": 6,
    "yearly": 12,
}


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT
                sp.id AS legacy_plan_id,
                sp.organization_id AS organization_id,
                sp.tenant_id AS tenant_id,
                sp.name AS name,
                sp.billing_cycle AS billing_cycle,
                sp.price AS price,
                sp.stripe_price_id AS stripe_price_id,
                s.id AS space_id,
                s.space_type AS space_type,
                s.capacity AS capacity
            FROM subscription_plans sp
            JOIN spaces s
              ON s.tenant_id = sp.tenant_id
             AND s.space_type = sp.space_type
            WHERE sp.is_active = true
              AND s.space_type IN ('shared_desk', 'virtual_office', 'private_office', 'suite')
            ORDER BY sp.id ASC, s.id ASC
            """
        )
    ).mappings().all()

    for row in rows:
        booking_mode = BOOKING_MODE_BY_SPACE_TYPE.get(row["space_type"])
        if not booking_mode:
            continue
        price_cents = int(row["price"] or 0) * 100
        billing_cycle = row["billing_cycle"] or "monthly"
        plan_name = row["name"] or "Membership"
        existing = bind.execute(
            sa.text(
                """
                SELECT 1
                FROM membership_plans
                WHERE space_id = :space_id
                  AND booking_mode = :booking_mode
                  AND name = :name
                  AND billing_cycle = :billing_cycle
                  AND price_cents = :price_cents
                LIMIT 1
                """
            ),
            {
                "space_id": row["space_id"],
                "booking_mode": booking_mode,
                "name": plan_name,
                "billing_cycle": billing_cycle,
                "price_cents": price_cents,
            },
        ).first()
        if not existing:
            seats_per_plan = max(1, int(row["capacity"] or 1)) if row["space_type"] in {"private_office", "suite"} else 1
            bind.execute(
                sa.text(
                    """
                    INSERT INTO membership_plans
                        (
                            public_id, tenant_id, organization_id, space_id, booking_mode,
                            name, description, price_cents, billing_cycle, stripe_price_id,
                            commitment_months, auto_renew,
                            included_meeting_room_hours_per_month, overage_hourly_rate_cents,
                            seats_per_plan, max_active_subscriptions, is_active, sort_order,
                            created_at, updated_at
                        )
                    VALUES
                        (
                            :public_id, :tenant_id, :organization_id, :space_id, :booking_mode,
                            :name, NULL, :price_cents, :billing_cycle, :stripe_price_id,
                            :commitment_months, false,
                            0, NULL,
                            :seats_per_plan, NULL, true, 0,
                            now(), now()
                        )
                    """
                ),
                {
                    "public_id": str(uuid.uuid4()),
                    "tenant_id": row["tenant_id"],
                    "organization_id": row["organization_id"],
                    "space_id": row["space_id"],
                    "booking_mode": booking_mode,
                    "name": plan_name,
                    "price_cents": price_cents,
                    "billing_cycle": billing_cycle,
                    "stripe_price_id": row["stripe_price_id"],
                    "commitment_months": COMMITMENT_MONTHS_BY_BILLING_CYCLE.get(billing_cycle),
                    "seats_per_plan": seats_per_plan,
                },
            )

        mode_row = bind.execute(
            sa.text(
                """
                SELECT id
                FROM space_booking_modes
                WHERE space_id = :space_id
                  AND booking_mode = :booking_mode
                LIMIT 1
                """
            ),
            {"space_id": row["space_id"], "booking_mode": booking_mode},
        ).first()
        if mode_row:
            bind.execute(
                sa.text(
                    """
                    UPDATE space_booking_modes
                    SET is_enabled = true, updated_at = now()
                    WHERE id = :id
                    """
                ),
                {"id": mode_row.id},
            )
        else:
            bind.execute(
                sa.text(
                    """
                    INSERT INTO space_booking_modes
                        (public_id, tenant_id, space_id, booking_mode, is_enabled, created_at, updated_at)
                    VALUES
                        (:public_id, :tenant_id, :space_id, :booking_mode, true, now(), now())
                    """
                ),
                {
                    "public_id": str(uuid.uuid4()),
                    "tenant_id": row["tenant_id"],
                    "space_id": row["space_id"],
                    "booking_mode": booking_mode,
                },
            )

    op.drop_table("subscription_plans")


def downgrade() -> None:
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(120), nullable=False, server_default="Membership"),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("space_type", sa.String(32), nullable=False),
        sa.Column("billing_cycle", sa.String(32), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("access_rules", sa.Integer(), nullable=True),
        sa.Column("stripe_price_id", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name="fk_subscription_plans_organization_id",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["organizations.id"],
            name="fk_subscription_plans_tenant_id",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.UniqueConstraint("public_id"),
    )
    op.create_index("ix_subscription_plans_public_id", "subscription_plans", ["public_id"], unique=True)
    op.create_index("ix_subscription_plans_organization_id", "subscription_plans", ["organization_id"])
    op.create_index("ix_subscription_plans_tenant_id", "subscription_plans", ["tenant_id"])
