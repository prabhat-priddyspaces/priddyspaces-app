"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-01-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("email_verified", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id"),
        sa.UniqueConstraint("email")
    )
    op.create_index("ix_users_public_id", "users", ["public_id"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("owner_id", sa.Integer, nullable=False),
        sa.Column("branding", sa.String(1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_organizations_public_id", "organizations", ["public_id"], unique=True)

    op.create_table(
        "organization_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("can_override_pricing", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_organization_members_public_id", "organization_members", ["public_id"], unique=True)

    op.create_table(
        "locations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(512), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("amenities", sa.String(1024), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("booking_granularity", sa.String(16), nullable=False, server_default="60m"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_locations_public_id", "locations", ["public_id"], unique=True)

    op.create_table(
        "location_admins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("location_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_location_admins_public_id", "location_admins", ["public_id"], unique=True)

    op.create_table(
        "floor_plans",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("location_id", sa.Integer, nullable=False),
        sa.Column("image_url", sa.String(1024), nullable=False),
        sa.Column("scale", sa.String(64), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_floor_plans_public_id", "floor_plans", ["public_id"], unique=True)

    op.create_table(
        "spaces",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("location_id", sa.Integer, nullable=False),
        sa.Column("space_type", sa.String(32), nullable=False),
        sa.Column("size_sqft", sa.Float, nullable=True),
        sa.Column("capacity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("price_monthly", sa.Integer, nullable=True),
        sa.Column("price_daily", sa.Integer, nullable=True),
        sa.Column("availability_status", sa.String(32), nullable=False, server_default="available"),
        sa.Column("floor_plan_id", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_spaces_public_id", "spaces", ["public_id"], unique=True)

    op.create_table(
        "floor_plan_markers",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("floor_plan_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("x_coordinate", sa.Float, nullable=False),
        sa.Column("y_coordinate", sa.Float, nullable=False),
        sa.Column("width", sa.Float, nullable=False),
        sa.Column("height", sa.Float, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_floor_plan_markers_public_id", "floor_plan_markers", ["public_id"], unique=True)

    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.Integer, nullable=False),
        sa.Column("space_type", sa.String(32), nullable=False),
        sa.Column("billing_cycle", sa.String(32), nullable=False),
        sa.Column("price", sa.Integer, nullable=False),
        sa.Column("access_rules", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_subscription_plans_public_id", "subscription_plans", ["public_id"], unique=True)

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("stripe_subscription_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_subscriptions_public_id", "subscriptions", ["public_id"], unique=True)

    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("space_id", sa.Integer, nullable=False),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_bookings_public_id", "bookings", ["public_id"], unique=True)

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.Integer, nullable=False),
        sa.Column("subscription_id", sa.Integer, nullable=True),
        sa.Column("booking_id", sa.Integer, nullable=True),
        sa.Column("amount", sa.Integer, nullable=False),
        sa.Column("provider", sa.String(32), nullable=False, server_default="stripe"),
        sa.Column("status", sa.String(32), nullable=False, server_default="requires_payment"),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_payments_public_id", "payments", ["public_id"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("public_id", sa.String(36), nullable=False),
        sa.Column("actor_id", sa.Integer, nullable=False),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=False),
        sa.Column("entity_public_id", sa.String(36), nullable=False),
        sa.Column("before_state", sa.JSON, nullable=True),
        sa.Column("after_state", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("public_id")
    )
    op.create_index("ix_audit_logs_public_id", "audit_logs", ["public_id"], unique=True)


def downgrade():
    op.drop_index("ix_audit_logs_public_id", table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index("ix_payments_public_id", table_name="payments")
    op.drop_table("payments")
    op.drop_index("ix_bookings_public_id", table_name="bookings")
    op.drop_table("bookings")
    op.drop_index("ix_subscriptions_public_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_index("ix_subscription_plans_public_id", table_name="subscription_plans")
    op.drop_table("subscription_plans")
    op.drop_index("ix_floor_plan_markers_public_id", table_name="floor_plan_markers")
    op.drop_table("floor_plan_markers")
    op.drop_index("ix_spaces_public_id", table_name="spaces")
    op.drop_table("spaces")
    op.drop_index("ix_floor_plans_public_id", table_name="floor_plans")
    op.drop_table("floor_plans")
    op.drop_index("ix_location_admins_public_id", table_name="location_admins")
    op.drop_table("location_admins")
    op.drop_index("ix_locations_public_id", table_name="locations")
    op.drop_table("locations")
    op.drop_index("ix_organization_members_public_id", table_name="organization_members")
    op.drop_table("organization_members")
    op.drop_index("ix_organizations_public_id", table_name="organizations")
    op.drop_table("organizations")
    op.drop_index("ix_users_public_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
