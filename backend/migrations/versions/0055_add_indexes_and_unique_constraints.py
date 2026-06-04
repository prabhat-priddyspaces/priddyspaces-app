"""Add missing indexes and unique constraints on core tables

Revision ID: 0055_add_indexes_and_unique_constraints
Revises: 0054_owner_promo_redemption
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0055_add_indexes_and_unique_constraints"
down_revision = "0054_owner_promo_redemption"
branch_labels = None
depends_on = None


def _add_unique_constraint_if_not_exists(name: str, table: str, columns: list[str]) -> None:
    col_list = ", ".join(columns)
    op.execute(sa.text(
        f"DO $$ BEGIN "
        f"ALTER TABLE {table} ADD CONSTRAINT {name} UNIQUE ({col_list}); "
        f"EXCEPTION WHEN duplicate_table THEN NULL; "
        f"WHEN duplicate_object THEN NULL; "
        f"END $$"
    ))


def upgrade() -> None:
    # ── bookings ────────────────────────────────────────────────────────────
    op.create_index("ix_bookings_user_id", "bookings", ["user_id"], if_not_exists=True)
    op.create_index("ix_bookings_space_id", "bookings", ["space_id"], if_not_exists=True)
    op.create_index("ix_bookings_tenant_id", "bookings", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_bookings_status", "bookings", ["status"], if_not_exists=True)

    # ── booking_requests ────────────────────────────────────────────────────
    op.create_index("ix_booking_requests_user_id", "booking_requests", ["user_id"], if_not_exists=True)
    op.create_index("ix_booking_requests_space_id", "booking_requests", ["space_id"], if_not_exists=True)
    op.create_index("ix_booking_requests_tenant_id", "booking_requests", ["tenant_id"], if_not_exists=True)

    # ── payments ────────────────────────────────────────────────────────────
    op.create_index("ix_payments_user_id", "payments", ["user_id"], if_not_exists=True)
    op.create_index("ix_payments_booking_id", "payments", ["booking_id"], if_not_exists=True)
    op.create_index("ix_payments_booking_request_id", "payments", ["booking_request_id"], if_not_exists=True)
    op.create_index("ix_payments_tenant_id", "payments", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_payments_status", "payments", ["status"], if_not_exists=True)
    # Partial unique index: idempotency_key is unique when set
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_idempotency_key "
        "ON payments (idempotency_key) "
        "WHERE idempotency_key IS NOT NULL"
    ))

    # ── subscriptions ───────────────────────────────────────────────────────
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"], if_not_exists=True)
    op.create_index("ix_subscriptions_space_id", "subscriptions", ["space_id"], if_not_exists=True)
    op.create_index("ix_subscriptions_tenant_id", "subscriptions", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"], if_not_exists=True)
    # Partial unique: stripe_subscription_id is unique when set
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_stripe_id "
        "ON subscriptions (stripe_subscription_id) "
        "WHERE stripe_subscription_id IS NOT NULL"
    ))

    # ── locations ───────────────────────────────────────────────────────────
    op.create_index("ix_locations_organization_id", "locations", ["organization_id"], if_not_exists=True)
    op.create_index("ix_locations_tenant_id", "locations", ["tenant_id"], if_not_exists=True)

    # ── spaces ──────────────────────────────────────────────────────────────
    op.create_index("ix_spaces_location_id", "spaces", ["location_id"], if_not_exists=True)
    op.create_index("ix_spaces_tenant_id", "spaces", ["tenant_id"], if_not_exists=True)

    # ── organizations ────────────────────────────────────────────────────────
    op.create_index("ix_organizations_owner_id", "organizations", ["owner_id"], if_not_exists=True)

    # ── invoices ─────────────────────────────────────────────────────────────
    op.create_index("ix_invoices_user_id", "invoices", ["user_id"], if_not_exists=True)
    op.create_index("ix_invoices_booking_id", "invoices", ["booking_id"], if_not_exists=True)
    op.create_index("ix_invoices_payment_id", "invoices", ["payment_id"], if_not_exists=True)
    op.create_index("ix_invoices_tenant_id", "invoices", ["tenant_id"], if_not_exists=True)

    # ── owner_payment_settings ───────────────────────────────────────────────
    op.create_index("ix_owner_payment_settings_org_id", "owner_payment_settings", ["organization_id"], if_not_exists=True)
    op.create_index("ix_owner_payment_settings_tenant_id", "owner_payment_settings", ["tenant_id"], if_not_exists=True)
    # Unique: one payment setting per org per provider
    _add_unique_constraint_if_not_exists(
        "uq_owner_payment_settings_org_provider",
        "owner_payment_settings",
        ["organization_id", "provider"],
    )

    # ── organization_members ─────────────────────────────────────────────────
    op.create_index("ix_organization_members_organization_id", "organization_members", ["organization_id"], if_not_exists=True)
    op.create_index("ix_organization_members_tenant_id", "organization_members", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_organization_members_user_id", "organization_members", ["user_id"], if_not_exists=True)
    _add_unique_constraint_if_not_exists(
        "uq_organization_members_org_user",
        "organization_members",
        ["organization_id", "user_id"],
    )

    # ── feature_flags ────────────────────────────────────────────────────────
    op.create_index("ix_feature_flags_tenant_id", "feature_flags", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_feature_flags_scope", "feature_flags", ["scope_type", "scope_id"], if_not_exists=True)
    _add_unique_constraint_if_not_exists(
        "uq_feature_flags_tenant_key_scope",
        "feature_flags",
        ["tenant_id", "flag_key", "scope_type", "scope_id"],
    )

    # ── cancellation_policies ────────────────────────────────────────────────
    op.create_index("ix_cancellation_policies_tenant_id", "cancellation_policies", ["tenant_id"], if_not_exists=True)
    # NOTE: unique constraint on (tenant_id, space_type) was removed — production data has
    # legitimate duplicates (multiple policies per space type per tenant, e.g. different tiers).

    # ── location_admins ──────────────────────────────────────────────────────
    op.create_index("ix_location_admins_location_id", "location_admins", ["location_id"], if_not_exists=True)
    op.create_index("ix_location_admins_user_id", "location_admins", ["user_id"], if_not_exists=True)
    op.create_index("ix_location_admins_tenant_id", "location_admins", ["tenant_id"], if_not_exists=True)
    _add_unique_constraint_if_not_exists(
        "uq_location_admins_location_user",
        "location_admins",
        ["location_id", "user_id"],
    )

    # ── floor_plans ──────────────────────────────────────────────────────────
    op.create_index("ix_floor_plans_location_id", "floor_plans", ["location_id"], if_not_exists=True)
    op.create_index("ix_floor_plans_tenant_id", "floor_plans", ["tenant_id"], if_not_exists=True)

    # ── floor_plan_markers ───────────────────────────────────────────────────
    op.create_index("ix_floor_plan_markers_floor_plan_id", "floor_plan_markers", ["floor_plan_id"], if_not_exists=True)
    op.create_index("ix_floor_plan_markers_space_id", "floor_plan_markers", ["space_id"], if_not_exists=True)
    op.create_index("ix_floor_plan_markers_tenant_id", "floor_plan_markers", ["tenant_id"], if_not_exists=True)

    # ── space_images ─────────────────────────────────────────────────────────
    op.create_index("ix_space_images_space_id", "space_images", ["space_id"], if_not_exists=True)
    op.create_index("ix_space_images_tenant_id", "space_images", ["tenant_id"], if_not_exists=True)

    # ── space_volume_discounts ───────────────────────────────────────────────
    op.create_index("ix_space_volume_discounts_tenant_id", "space_volume_discounts", ["tenant_id"], if_not_exists=True)

    # ── space_booking_modes ──────────────────────────────────────────────────
    op.create_index("ix_space_booking_modes_tenant_id", "space_booking_modes", ["tenant_id"], if_not_exists=True)

    # ── member_owner_payment_methods ─────────────────────────────────────────
    op.create_index("ix_member_owner_payment_methods_user_id", "member_owner_payment_methods", ["user_id"], if_not_exists=True)
    op.create_index("ix_member_owner_payment_methods_org_id", "member_owner_payment_methods", ["organization_id"], if_not_exists=True)
    op.create_index("ix_member_owner_payment_methods_tenant_id", "member_owner_payment_methods", ["tenant_id"], if_not_exists=True)

    # ── membership_plans ─────────────────────────────────────────────────────
    op.create_index("ix_membership_plans_tenant_id", "membership_plans", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_membership_plans_organization_id", "membership_plans", ["organization_id"], if_not_exists=True)

    # ── subscription_plans ───────────────────────────────────────────────────
    op.create_index("ix_subscription_plans_organization_id", "subscription_plans", ["organization_id"], if_not_exists=True)
    op.create_index("ix_subscription_plans_tenant_id", "subscription_plans", ["tenant_id"], if_not_exists=True)

    # ── pricing_rules ────────────────────────────────────────────────────────
    op.create_index("ix_pricing_rules_space_id", "pricing_rules", ["space_id"], if_not_exists=True)
    op.create_index("ix_pricing_rules_tenant_id", "pricing_rules", ["tenant_id"], if_not_exists=True)

    # ── audit_logs ───────────────────────────────────────────────────────────
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"], if_not_exists=True)
    op.create_index("ix_audit_logs_entity_type_public_id", "audit_logs", ["entity_type", "entity_public_id"], if_not_exists=True)

    # ── meeting_room_hour_ledger ─────────────────────────────────────────────
    op.create_index("ix_meeting_room_hour_ledger_tenant_id", "meeting_room_hour_ledger", ["tenant_id"], if_not_exists=True)
    op.create_index("ix_meeting_room_hour_ledger_booking_id", "meeting_room_hour_ledger", ["booking_id"], if_not_exists=True)

    # ── promo_codes ──────────────────────────────────────────────────────────
    op.create_index("ix_promo_codes_tenant_id", "promo_codes", ["tenant_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_promo_codes_tenant_id", table_name="promo_codes", if_exists=True)
    op.drop_index("ix_meeting_room_hour_ledger_booking_id", table_name="meeting_room_hour_ledger", if_exists=True)
    op.drop_index("ix_meeting_room_hour_ledger_tenant_id", table_name="meeting_room_hour_ledger", if_exists=True)
    op.drop_index("ix_audit_logs_entity_type_public_id", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_audit_logs_actor_id", table_name="audit_logs", if_exists=True)
    op.drop_index("ix_pricing_rules_tenant_id", table_name="pricing_rules", if_exists=True)
    op.drop_index("ix_pricing_rules_space_id", table_name="pricing_rules", if_exists=True)
    op.drop_index("ix_subscription_plans_tenant_id", table_name="subscription_plans", if_exists=True)
    op.drop_index("ix_subscription_plans_organization_id", table_name="subscription_plans", if_exists=True)
    op.drop_index("ix_membership_plans_organization_id", table_name="membership_plans", if_exists=True)
    op.drop_index("ix_membership_plans_tenant_id", table_name="membership_plans", if_exists=True)
    op.drop_index("ix_member_owner_payment_methods_tenant_id", table_name="member_owner_payment_methods", if_exists=True)
    op.drop_index("ix_member_owner_payment_methods_org_id", table_name="member_owner_payment_methods", if_exists=True)
    op.drop_index("ix_member_owner_payment_methods_user_id", table_name="member_owner_payment_methods", if_exists=True)
    op.drop_index("ix_space_booking_modes_tenant_id", table_name="space_booking_modes", if_exists=True)
    op.drop_index("ix_space_volume_discounts_tenant_id", table_name="space_volume_discounts", if_exists=True)
    op.drop_index("ix_space_images_tenant_id", table_name="space_images", if_exists=True)
    op.drop_index("ix_space_images_space_id", table_name="space_images", if_exists=True)
    op.drop_index("ix_floor_plan_markers_tenant_id", table_name="floor_plan_markers", if_exists=True)
    op.drop_index("ix_floor_plan_markers_space_id", table_name="floor_plan_markers", if_exists=True)
    op.drop_index("ix_floor_plan_markers_floor_plan_id", table_name="floor_plan_markers", if_exists=True)
    op.drop_index("ix_floor_plans_tenant_id", table_name="floor_plans", if_exists=True)
    op.drop_index("ix_floor_plans_location_id", table_name="floor_plans", if_exists=True)
    op.execute(sa.text("ALTER TABLE location_admins DROP CONSTRAINT IF EXISTS uq_location_admins_location_user"))
    op.drop_index("ix_location_admins_tenant_id", table_name="location_admins", if_exists=True)
    op.drop_index("ix_location_admins_user_id", table_name="location_admins", if_exists=True)
    op.drop_index("ix_location_admins_location_id", table_name="location_admins", if_exists=True)
    op.drop_index("ix_cancellation_policies_tenant_id", table_name="cancellation_policies", if_exists=True)
    op.execute(sa.text("ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS uq_feature_flags_tenant_key_scope"))
    op.drop_index("ix_feature_flags_scope", table_name="feature_flags", if_exists=True)
    op.drop_index("ix_feature_flags_tenant_id", table_name="feature_flags", if_exists=True)
    op.execute(sa.text("ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS uq_organization_members_org_user"))
    op.drop_index("ix_organization_members_user_id", table_name="organization_members", if_exists=True)
    op.drop_index("ix_organization_members_tenant_id", table_name="organization_members", if_exists=True)
    op.drop_index("ix_organization_members_organization_id", table_name="organization_members", if_exists=True)
    op.execute(sa.text("ALTER TABLE owner_payment_settings DROP CONSTRAINT IF EXISTS uq_owner_payment_settings_org_provider"))
    op.drop_index("ix_owner_payment_settings_tenant_id", table_name="owner_payment_settings", if_exists=True)
    op.drop_index("ix_owner_payment_settings_org_id", table_name="owner_payment_settings", if_exists=True)
    op.drop_index("ix_invoices_tenant_id", table_name="invoices", if_exists=True)
    op.drop_index("ix_invoices_payment_id", table_name="invoices", if_exists=True)
    op.drop_index("ix_invoices_booking_id", table_name="invoices", if_exists=True)
    op.drop_index("ix_invoices_user_id", table_name="invoices", if_exists=True)
    op.drop_index("ix_organizations_owner_id", table_name="organizations", if_exists=True)
    op.drop_index("ix_spaces_tenant_id", table_name="spaces", if_exists=True)
    op.drop_index("ix_spaces_location_id", table_name="spaces", if_exists=True)
    op.drop_index("ix_locations_tenant_id", table_name="locations", if_exists=True)
    op.drop_index("ix_locations_organization_id", table_name="locations", if_exists=True)
    op.execute(sa.text("DROP INDEX IF EXISTS uq_subscriptions_stripe_id"))
    op.drop_index("ix_subscriptions_status", table_name="subscriptions", if_exists=True)
    op.drop_index("ix_subscriptions_tenant_id", table_name="subscriptions", if_exists=True)
    op.drop_index("ix_subscriptions_space_id", table_name="subscriptions", if_exists=True)
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions", if_exists=True)
    op.execute(sa.text("DROP INDEX IF EXISTS uq_payments_idempotency_key"))
    op.drop_index("ix_payments_status", table_name="payments", if_exists=True)
    op.drop_index("ix_payments_tenant_id", table_name="payments", if_exists=True)
    op.drop_index("ix_payments_booking_request_id", table_name="payments", if_exists=True)
    op.drop_index("ix_payments_booking_id", table_name="payments", if_exists=True)
    op.drop_index("ix_payments_user_id", table_name="payments", if_exists=True)
    op.drop_index("ix_booking_requests_tenant_id", table_name="booking_requests", if_exists=True)
    op.drop_index("ix_booking_requests_space_id", table_name="booking_requests", if_exists=True)
    op.drop_index("ix_booking_requests_user_id", table_name="booking_requests", if_exists=True)
    op.drop_index("ix_bookings_status", table_name="bookings", if_exists=True)
    op.drop_index("ix_bookings_tenant_id", table_name="bookings", if_exists=True)
    op.drop_index("ix_bookings_space_id", table_name="bookings", if_exists=True)
    op.drop_index("ix_bookings_user_id", table_name="bookings", if_exists=True)
