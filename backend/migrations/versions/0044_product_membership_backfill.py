"""backfill product membership plans from legacy subscription plans

Revision ID: 0044_product_membership_backfill
Revises: 0043_booking_approval_recovery
Create Date: 2026-05-30
"""
import uuid

from alembic import op
import sqlalchemy as sa


revision = "0044_product_membership_backfill"
down_revision = "0043_booking_approval_recovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT
                s.id AS space_id,
                s.tenant_id AS tenant_id,
                sp.organization_id AS organization_id,
                s.space_type AS space_type,
                sp.name AS plan_name,
                sp.billing_cycle AS billing_cycle,
                sp.price AS price,
                sp.stripe_price_id AS stripe_price_id
            FROM spaces s
            JOIN subscription_plans sp
              ON sp.tenant_id = s.tenant_id
             AND sp.space_type = s.space_type
             AND sp.is_active = true
            WHERE s.space_type IN ('shared_desk', 'virtual_office')
              AND NOT EXISTS (
                  SELECT 1 FROM membership_plans mp
                  WHERE mp.space_id = s.id
                    AND mp.booking_mode = CASE
                        WHEN s.space_type = 'shared_desk' THEN 'monthly_membership'
                        ELSE 'virtual_membership'
                    END
              )
            """
        )
    ).fetchall()

    for row in rows:
        booking_mode = (
            "monthly_membership"
            if row.space_type == "shared_desk"
            else "virtual_membership"
        )
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
                        1, false,
                        0, NULL,
                        1, NULL, true, 0,
                        now(), now()
                    )
                """
            ),
            {
                "public_id": str(uuid.uuid4()),
                "tenant_id": row.tenant_id,
                "organization_id": row.organization_id,
                "space_id": row.space_id,
                "booking_mode": booking_mode,
                "name": row.plan_name,
                "price_cents": int(row.price or 0) * 100,
                "billing_cycle": row.billing_cycle,
                "stripe_price_id": row.stripe_price_id,
            },
        )
        existing_mode = bind.execute(
            sa.text(
                """
                SELECT id FROM space_booking_modes
                WHERE space_id = :space_id AND booking_mode = :booking_mode
                """
            ),
            {"space_id": row.space_id, "booking_mode": booking_mode},
        ).first()
        if existing_mode:
            bind.execute(
                sa.text(
                    """
                    UPDATE space_booking_modes
                    SET is_enabled = true, updated_at = now()
                    WHERE id = :id
                    """
                ),
                {"id": existing_mode.id},
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
                    "tenant_id": row.tenant_id,
                    "space_id": row.space_id,
                    "booking_mode": booking_mode,
                },
            )


def downgrade() -> None:
    # Keep backfilled plans on downgrade to avoid deleting owner-visible pricing.
    pass
