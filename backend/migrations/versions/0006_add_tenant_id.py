"""add tenant_id to tenant-owned tables

Revision ID: 0006_add_tenant_id
Revises: 0005_location_city
Create Date: 2026-01-31

"""
from alembic import op
import sqlalchemy as sa

revision = "0006_add_tenant_id"
down_revision = "0005_location_city"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organization_members", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("locations", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("spaces", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("floor_plans", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("floor_plan_markers", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("subscription_plans", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("subscriptions", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("bookings", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("payment_events", sa.Column("tenant_id", sa.Integer(), nullable=True))
    op.add_column("location_admins", sa.Column("tenant_id", sa.Integer(), nullable=True))

    op.execute(
        "UPDATE organization_members SET tenant_id = organization_id WHERE tenant_id IS NULL"
    )
    op.execute(
        "UPDATE locations SET tenant_id = organization_id WHERE tenant_id IS NULL"
    )
    op.execute(
        "UPDATE subscription_plans SET tenant_id = organization_id WHERE tenant_id IS NULL"
    )
    op.execute(
        """
        UPDATE spaces
        SET tenant_id = locations.organization_id
        FROM locations
        WHERE spaces.location_id = locations.id
          AND spaces.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE floor_plans
        SET tenant_id = locations.organization_id
        FROM locations
        WHERE floor_plans.location_id = locations.id
          AND floor_plans.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE floor_plan_markers
        SET tenant_id = locations.organization_id
        FROM floor_plans
        JOIN locations ON floor_plans.location_id = locations.id
        WHERE floor_plan_markers.floor_plan_id = floor_plans.id
          AND floor_plan_markers.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE subscriptions
        SET tenant_id = locations.organization_id
        FROM spaces
        JOIN locations ON spaces.location_id = locations.id
        WHERE subscriptions.space_id = spaces.id
          AND subscriptions.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE bookings
        SET tenant_id = locations.organization_id
        FROM spaces
        JOIN locations ON spaces.location_id = locations.id
        WHERE bookings.space_id = spaces.id
          AND bookings.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE location_admins
        SET tenant_id = locations.organization_id
        FROM locations
        WHERE location_admins.location_id = locations.id
          AND location_admins.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE payments
        SET tenant_id = subscriptions.tenant_id
        FROM subscriptions
        WHERE payments.subscription_id = subscriptions.id
          AND payments.tenant_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE payments
        SET tenant_id = bookings.tenant_id
        FROM bookings
        WHERE payments.booking_id = bookings.id
          AND payments.tenant_id IS NULL
        """
    )

    op.alter_column("organization_members", "tenant_id", nullable=False)
    op.alter_column("locations", "tenant_id", nullable=False)
    op.alter_column("spaces", "tenant_id", nullable=False)
    op.alter_column("floor_plans", "tenant_id", nullable=False)
    op.alter_column("floor_plan_markers", "tenant_id", nullable=False)
    op.alter_column("subscription_plans", "tenant_id", nullable=False)
    op.alter_column("subscriptions", "tenant_id", nullable=False)
    op.alter_column("bookings", "tenant_id", nullable=False)
    op.alter_column("location_admins", "tenant_id", nullable=False)


def downgrade():
    op.drop_column("location_admins", "tenant_id")
    op.drop_column("payment_events", "tenant_id")
    op.drop_column("payments", "tenant_id")
    op.drop_column("bookings", "tenant_id")
    op.drop_column("subscriptions", "tenant_id")
    op.drop_column("subscription_plans", "tenant_id")
    op.drop_column("floor_plan_markers", "tenant_id")
    op.drop_column("floor_plans", "tenant_id")
    op.drop_column("spaces", "tenant_id")
    op.drop_column("locations", "tenant_id")
    op.drop_column("organization_members", "tenant_id")
