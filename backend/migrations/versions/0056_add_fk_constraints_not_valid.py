"""Add foreign key constraints (NOT VALID) on all cross-table integer columns

Uses NOT VALID so the migration runs instantly without scanning existing rows.
Validation of existing rows happens in migration 0057.

Revision ID: 0056_add_fk_constraints_not_valid
Revises: 0055_add_indexes_and_unique_constraints
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0056_add_fk_constraints_not_valid"
down_revision = "0055_add_indexes_and_unique_constraints"
branch_labels = None
depends_on = None


def _add_fk(table: str, column: str, ref_table: str, ref_col: str = "id", on_delete: str = "RESTRICT") -> None:
    name = f"fk_{table}_{column}"
    op.execute(sa.text(
        f"ALTER TABLE {table} "
        f"ADD CONSTRAINT {name} "
        f"FOREIGN KEY ({column}) REFERENCES {ref_table}({ref_col}) "
        f"ON DELETE {on_delete} NOT VALID"
    ))


def upgrade() -> None:
    # ── bookings ────────────────────────────────────────────────────────────
    _add_fk("bookings", "user_id", "users")
    _add_fk("bookings", "space_id", "spaces")
    _add_fk("bookings", "tenant_id", "organizations")
    _add_fk("bookings", "booking_series_id", "booking_series", on_delete="SET NULL")
    _add_fk("bookings", "booking_request_id", "booking_requests", on_delete="SET NULL")

    # ── booking_requests ────────────────────────────────────────────────────
    _add_fk("booking_requests", "user_id", "users", on_delete="SET NULL")
    _add_fk("booking_requests", "space_id", "spaces")
    _add_fk("booking_requests", "tenant_id", "organizations")
    _add_fk("booking_requests", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("booking_requests", "booking_series_id", "booking_series", on_delete="SET NULL")
    _add_fk("booking_requests", "created_by_user_id", "users", on_delete="SET NULL")
    _add_fk("booking_requests", "membership_plan_id", "membership_plans", on_delete="SET NULL")
    _add_fk("booking_requests", "owner_payment_setting_id", "owner_payment_settings", on_delete="SET NULL")
    _add_fk("booking_requests", "member_owner_payment_method_id", "member_owner_payment_methods", on_delete="SET NULL")
    _add_fk("booking_requests", "loyalty_redemption_lock_id", "loyalty_redemption_locks", on_delete="SET NULL")

    # ── booking_series ───────────────────────────────────────────────────────
    _add_fk("booking_series", "user_id", "users")
    _add_fk("booking_series", "space_id", "spaces")
    _add_fk("booking_series", "tenant_id", "organizations")
    _add_fk("booking_series", "booking_request_id", "booking_requests", on_delete="SET NULL")

    # ── booking_waitlist_entries ─────────────────────────────────────────────
    _add_fk("booking_waitlist_entries", "tenant_id", "organizations")
    _add_fk("booking_waitlist_entries", "organization_id", "organizations")
    _add_fk("booking_waitlist_entries", "location_id", "locations")
    _add_fk("booking_waitlist_entries", "space_id", "spaces")
    _add_fk("booking_waitlist_entries", "user_id", "users")
    _add_fk("booking_waitlist_entries", "membership_plan_id", "membership_plans", on_delete="SET NULL")
    _add_fk("booking_waitlist_entries", "booking_request_id", "booking_requests", on_delete="SET NULL")

    # ── booking_promotions ───────────────────────────────────────────────────
    _add_fk("booking_promotions", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("booking_promotions", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("booking_promotions", "promo_code_id", "promo_codes")

    # ── booking_payment_links ────────────────────────────────────────────────
    _add_fk("booking_payment_links", "tenant_id", "organizations")
    _add_fk("booking_payment_links", "booking_request_id", "booking_requests")
    _add_fk("booking_payment_links", "created_by_user_id", "users", on_delete="SET NULL")

    # ── payments ────────────────────────────────────────────────────────────
    _add_fk("payments", "user_id", "users")
    _add_fk("payments", "tenant_id", "organizations")
    _add_fk("payments", "subscription_id", "subscriptions", on_delete="SET NULL")
    _add_fk("payments", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("payments", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("payments", "booking_series_id", "booking_series", on_delete="SET NULL")
    _add_fk("payments", "payment_method_id", "member_owner_payment_methods", on_delete="SET NULL")

    # ── payment_refunds ──────────────────────────────────────────────────────
    _add_fk("payment_refunds", "tenant_id", "organizations")
    _add_fk("payment_refunds", "payment_id", "payments")
    _add_fk("payment_refunds", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("payment_refunds", "booking_request_id", "booking_requests", on_delete="SET NULL")

    # ── payment_events ───────────────────────────────────────────────────────
    _add_fk("payment_events", "tenant_id", "organizations", on_delete="SET NULL")

    # ── subscriptions ────────────────────────────────────────────────────────
    _add_fk("subscriptions", "user_id", "users")
    _add_fk("subscriptions", "space_id", "spaces")
    _add_fk("subscriptions", "tenant_id", "organizations")
    _add_fk("subscriptions", "membership_plan_id", "membership_plans", on_delete="SET NULL")

    # ── invoices ─────────────────────────────────────────────────────────────
    _add_fk("invoices", "tenant_id", "organizations")
    _add_fk("invoices", "user_id", "users")
    _add_fk("invoices", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("invoices", "payment_id", "payments", on_delete="SET NULL")

    # ── locations ────────────────────────────────────────────────────────────
    _add_fk("locations", "organization_id", "organizations")
    _add_fk("locations", "tenant_id", "organizations")

    # ── spaces ───────────────────────────────────────────────────────────────
    _add_fk("spaces", "location_id", "locations")
    _add_fk("spaces", "tenant_id", "organizations")
    _add_fk("spaces", "floor_plan_id", "floor_plans", on_delete="SET NULL")

    # ── organizations ────────────────────────────────────────────────────────
    _add_fk("organizations", "owner_id", "users")
    _add_fk("organizations", "reviewed_by_user_id", "users", on_delete="SET NULL")

    # ── organization_members ─────────────────────────────────────────────────
    _add_fk("organization_members", "organization_id", "organizations")
    _add_fk("organization_members", "tenant_id", "organizations")
    _add_fk("organization_members", "user_id", "users")

    # ── org_member_profiles ──────────────────────────────────────────────────
    _add_fk("org_member_profiles", "organization_id", "organizations")
    _add_fk("org_member_profiles", "tenant_id", "organizations")
    _add_fk("org_member_profiles", "user_id", "users")
    _add_fk("org_member_profiles", "created_by_user_id", "users", on_delete="SET NULL")

    # ── space_access_passes ──────────────────────────────────────────────────
    _add_fk("space_access_passes", "tenant_id", "organizations")
    _add_fk("space_access_passes", "booking_id", "bookings")
    _add_fk("space_access_passes", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("space_access_passes", "location_id", "locations")
    _add_fk("space_access_passes", "space_id", "spaces")
    _add_fk("space_access_passes", "user_id", "users")

    # ── space_attendance_records ─────────────────────────────────────────────
    _add_fk("space_attendance_records", "tenant_id", "organizations")
    _add_fk("space_attendance_records", "access_pass_id", "space_access_passes")
    _add_fk("space_attendance_records", "booking_id", "bookings")
    _add_fk("space_attendance_records", "location_id", "locations")
    _add_fk("space_attendance_records", "space_id", "spaces")
    _add_fk("space_attendance_records", "member_id", "users")
    _add_fk("space_attendance_records", "scanned_by_user_id", "users")

    # ── cancellation_policies ────────────────────────────────────────────────
    _add_fk("cancellation_policies", "tenant_id", "organizations")

    # ── cancellation_policy_tiers ────────────────────────────────────────────
    _add_fk("cancellation_policy_tiers", "cancellation_policy_id", "cancellation_policies", on_delete="CASCADE")

    # ── pricing_rules ────────────────────────────────────────────────────────
    _add_fk("pricing_rules", "tenant_id", "organizations")
    _add_fk("pricing_rules", "space_id", "spaces")

    # ── membership_plans ─────────────────────────────────────────────────────
    _add_fk("membership_plans", "tenant_id", "organizations")
    _add_fk("membership_plans", "organization_id", "organizations")
    _add_fk("membership_plans", "space_id", "spaces")

    # ── subscription_plans ───────────────────────────────────────────────────
    _add_fk("subscription_plans", "organization_id", "organizations")
    _add_fk("subscription_plans", "tenant_id", "organizations")

    # ── floor_plans ──────────────────────────────────────────────────────────
    _add_fk("floor_plans", "location_id", "locations")
    _add_fk("floor_plans", "tenant_id", "organizations")

    # ── floor_plan_markers ───────────────────────────────────────────────────
    _add_fk("floor_plan_markers", "floor_plan_id", "floor_plans", on_delete="CASCADE")
    _add_fk("floor_plan_markers", "space_id", "spaces")
    _add_fk("floor_plan_markers", "tenant_id", "organizations")

    # ── location_admins ──────────────────────────────────────────────────────
    _add_fk("location_admins", "location_id", "locations")
    _add_fk("location_admins", "user_id", "users")
    _add_fk("location_admins", "tenant_id", "organizations")

    # ── space_images ─────────────────────────────────────────────────────────
    _add_fk("space_images", "tenant_id", "organizations")
    _add_fk("space_images", "space_id", "spaces")

    # ── space_setup_fee_items ────────────────────────────────────────────────
    _add_fk("space_setup_fee_items", "tenant_id", "organizations")
    _add_fk("space_setup_fee_items", "space_id", "spaces")

    # ── space_volume_discounts ───────────────────────────────────────────────
    _add_fk("space_volume_discounts", "organization_id", "organizations")
    _add_fk("space_volume_discounts", "tenant_id", "organizations")
    _add_fk("space_volume_discounts", "space_id", "spaces")

    # ── space_booking_modes ──────────────────────────────────────────────────
    _add_fk("space_booking_modes", "tenant_id", "organizations")
    _add_fk("space_booking_modes", "space_id", "spaces")

    # ── owner_payment_settings ───────────────────────────────────────────────
    _add_fk("owner_payment_settings", "organization_id", "organizations")
    _add_fk("owner_payment_settings", "tenant_id", "organizations")

    # ── member_owner_payment_methods ─────────────────────────────────────────
    _add_fk("member_owner_payment_methods", "user_id", "users")
    _add_fk("member_owner_payment_methods", "organization_id", "organizations")
    _add_fk("member_owner_payment_methods", "tenant_id", "organizations")
    _add_fk("member_owner_payment_methods", "owner_payment_setting_id", "owner_payment_settings")

    # ── feature_flags ────────────────────────────────────────────────────────
    _add_fk("feature_flags", "tenant_id", "organizations")

    # ── tax_configs ──────────────────────────────────────────────────────────
    _add_fk("tax_configs", "tenant_id", "organizations")

    # ── promo_codes ──────────────────────────────────────────────────────────
    _add_fk("promo_codes", "tenant_id", "organizations")

    # ── audit_logs ───────────────────────────────────────────────────────────
    _add_fk("audit_logs", "actor_id", "users")
    _add_fk("audit_logs", "acting_as_user_id", "users", on_delete="SET NULL")

    # ── user_notifications ───────────────────────────────────────────────────
    _add_fk("user_notifications", "user_id", "users")

    # ── push_subscriptions ───────────────────────────────────────────────────
    _add_fk("push_subscriptions", "user_id", "users")

    # ── platform_team_members ────────────────────────────────────────────────
    _add_fk("platform_team_members", "user_id", "users")
    _add_fk("platform_team_members", "invited_by", "users", on_delete="SET NULL")

    # ── meeting_room_hour_ledger ─────────────────────────────────────────────
    _add_fk("meeting_room_hour_ledger", "tenant_id", "organizations")
    _add_fk("meeting_room_hour_ledger", "subscription_id", "subscriptions")
    _add_fk("meeting_room_hour_ledger", "booking_id", "bookings", on_delete="SET NULL")

    # ── loyalty tables ───────────────────────────────────────────────────────
    _add_fk("loyalty_owner_settings", "organization_id", "organizations")
    _add_fk("loyalty_owner_settings", "tenant_id", "organizations")
    _add_fk("loyalty_wallets", "organization_id", "organizations")
    _add_fk("loyalty_wallets", "tenant_id", "organizations")
    _add_fk("loyalty_wallets", "user_id", "users")
    _add_fk("loyalty_campaigns", "organization_id", "organizations")
    _add_fk("loyalty_campaigns", "tenant_id", "organizations")
    _add_fk("loyalty_campaigns", "created_by_user_id", "users", on_delete="SET NULL")
    _add_fk("loyalty_redemption_locks", "organization_id", "organizations")
    _add_fk("loyalty_redemption_locks", "tenant_id", "organizations")
    _add_fk("loyalty_redemption_locks", "user_id", "users")
    _add_fk("loyalty_redemption_locks", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("loyalty_redemption_locks", "space_id", "spaces", on_delete="SET NULL")
    _add_fk("loyalty_redemptions", "organization_id", "organizations")
    _add_fk("loyalty_redemptions", "tenant_id", "organizations")
    _add_fk("loyalty_redemptions", "user_id", "users")
    _add_fk("loyalty_redemptions", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("loyalty_redemptions", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("loyalty_redemptions", "payment_id", "payments", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "organization_id", "organizations")
    _add_fk("loyalty_ledger_entries", "tenant_id", "organizations")
    _add_fk("loyalty_ledger_entries", "user_id", "users")
    _add_fk("loyalty_ledger_entries", "campaign_id", "loyalty_campaigns", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "payment_id", "payments", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "redemption_id", "loyalty_redemptions", on_delete="SET NULL")
    _add_fk("loyalty_ledger_entries", "redemption_lock_id", "loyalty_redemption_locks", on_delete="SET NULL")
    _add_fk("priddy_points_wallets", "user_id", "users")
    _add_fk("priddy_points_ledger_entries", "user_id", "users")
    _add_fk("priddy_points_ledger_entries", "booking_request_id", "booking_requests", on_delete="SET NULL")
    _add_fk("priddy_points_ledger_entries", "booking_id", "bookings", on_delete="SET NULL")
    _add_fk("priddy_points_ledger_entries", "payment_id", "payments", on_delete="SET NULL")
    _add_fk("priddy_points_ledger_entries", "redemption_id", "loyalty_redemptions", on_delete="SET NULL")
    _add_fk("priddy_points_ledger_entries", "redemption_lock_id", "loyalty_redemption_locks", on_delete="SET NULL")


def _drop_fk(table: str, column: str) -> None:
    name = f"fk_{table}_{column}"
    op.execute(sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}"))


def downgrade() -> None:
    _drop_fk("priddy_points_ledger_entries", "redemption_lock_id")
    _drop_fk("priddy_points_ledger_entries", "redemption_id")
    _drop_fk("priddy_points_ledger_entries", "payment_id")
    _drop_fk("priddy_points_ledger_entries", "booking_id")
    _drop_fk("priddy_points_ledger_entries", "booking_request_id")
    _drop_fk("priddy_points_ledger_entries", "user_id")
    _drop_fk("priddy_points_wallets", "user_id")
    _drop_fk("loyalty_ledger_entries", "redemption_lock_id")
    _drop_fk("loyalty_ledger_entries", "redemption_id")
    _drop_fk("loyalty_ledger_entries", "payment_id")
    _drop_fk("loyalty_ledger_entries", "booking_id")
    _drop_fk("loyalty_ledger_entries", "booking_request_id")
    _drop_fk("loyalty_ledger_entries", "campaign_id")
    _drop_fk("loyalty_ledger_entries", "user_id")
    _drop_fk("loyalty_ledger_entries", "tenant_id")
    _drop_fk("loyalty_ledger_entries", "organization_id")
    _drop_fk("loyalty_redemptions", "payment_id")
    _drop_fk("loyalty_redemptions", "booking_id")
    _drop_fk("loyalty_redemptions", "booking_request_id")
    _drop_fk("loyalty_redemptions", "user_id")
    _drop_fk("loyalty_redemptions", "tenant_id")
    _drop_fk("loyalty_redemptions", "organization_id")
    _drop_fk("loyalty_redemption_locks", "space_id")
    _drop_fk("loyalty_redemption_locks", "booking_request_id")
    _drop_fk("loyalty_redemption_locks", "user_id")
    _drop_fk("loyalty_redemption_locks", "tenant_id")
    _drop_fk("loyalty_redemption_locks", "organization_id")
    _drop_fk("loyalty_campaigns", "created_by_user_id")
    _drop_fk("loyalty_campaigns", "tenant_id")
    _drop_fk("loyalty_campaigns", "organization_id")
    _drop_fk("loyalty_wallets", "user_id")
    _drop_fk("loyalty_wallets", "tenant_id")
    _drop_fk("loyalty_wallets", "organization_id")
    _drop_fk("loyalty_owner_settings", "tenant_id")
    _drop_fk("loyalty_owner_settings", "organization_id")
    _drop_fk("meeting_room_hour_ledger", "booking_id")
    _drop_fk("meeting_room_hour_ledger", "subscription_id")
    _drop_fk("meeting_room_hour_ledger", "tenant_id")
    _drop_fk("platform_team_members", "invited_by")
    _drop_fk("platform_team_members", "user_id")
    _drop_fk("push_subscriptions", "user_id")
    _drop_fk("user_notifications", "user_id")
    _drop_fk("audit_logs", "acting_as_user_id")
    _drop_fk("audit_logs", "actor_id")
    _drop_fk("promo_codes", "tenant_id")
    _drop_fk("tax_configs", "tenant_id")
    _drop_fk("feature_flags", "tenant_id")
    _drop_fk("member_owner_payment_methods", "owner_payment_setting_id")
    _drop_fk("member_owner_payment_methods", "tenant_id")
    _drop_fk("member_owner_payment_methods", "organization_id")
    _drop_fk("member_owner_payment_methods", "user_id")
    _drop_fk("owner_payment_settings", "tenant_id")
    _drop_fk("owner_payment_settings", "organization_id")
    _drop_fk("space_booking_modes", "space_id")
    _drop_fk("space_booking_modes", "tenant_id")
    _drop_fk("space_volume_discounts", "space_id")
    _drop_fk("space_volume_discounts", "tenant_id")
    _drop_fk("space_volume_discounts", "organization_id")
    _drop_fk("space_setup_fee_items", "space_id")
    _drop_fk("space_setup_fee_items", "tenant_id")
    _drop_fk("space_images", "space_id")
    _drop_fk("space_images", "tenant_id")
    _drop_fk("location_admins", "tenant_id")
    _drop_fk("location_admins", "user_id")
    _drop_fk("location_admins", "location_id")
    _drop_fk("floor_plan_markers", "tenant_id")
    _drop_fk("floor_plan_markers", "space_id")
    _drop_fk("floor_plan_markers", "floor_plan_id")
    _drop_fk("floor_plans", "tenant_id")
    _drop_fk("floor_plans", "location_id")
    _drop_fk("subscription_plans", "tenant_id")
    _drop_fk("subscription_plans", "organization_id")
    _drop_fk("membership_plans", "space_id")
    _drop_fk("membership_plans", "organization_id")
    _drop_fk("membership_plans", "tenant_id")
    _drop_fk("pricing_rules", "space_id")
    _drop_fk("pricing_rules", "tenant_id")
    _drop_fk("cancellation_policy_tiers", "cancellation_policy_id")
    _drop_fk("cancellation_policies", "tenant_id")
    _drop_fk("space_attendance_records", "scanned_by_user_id")
    _drop_fk("space_attendance_records", "member_id")
    _drop_fk("space_attendance_records", "space_id")
    _drop_fk("space_attendance_records", "location_id")
    _drop_fk("space_attendance_records", "booking_id")
    _drop_fk("space_attendance_records", "access_pass_id")
    _drop_fk("space_attendance_records", "tenant_id")
    _drop_fk("space_access_passes", "user_id")
    _drop_fk("space_access_passes", "space_id")
    _drop_fk("space_access_passes", "location_id")
    _drop_fk("space_access_passes", "booking_request_id")
    _drop_fk("space_access_passes", "booking_id")
    _drop_fk("space_access_passes", "tenant_id")
    _drop_fk("org_member_profiles", "created_by_user_id")
    _drop_fk("org_member_profiles", "user_id")
    _drop_fk("org_member_profiles", "tenant_id")
    _drop_fk("org_member_profiles", "organization_id")
    _drop_fk("organization_members", "user_id")
    _drop_fk("organization_members", "tenant_id")
    _drop_fk("organization_members", "organization_id")
    _drop_fk("organizations", "reviewed_by_user_id")
    _drop_fk("organizations", "owner_id")
    _drop_fk("spaces", "floor_plan_id")
    _drop_fk("spaces", "tenant_id")
    _drop_fk("spaces", "location_id")
    _drop_fk("locations", "tenant_id")
    _drop_fk("locations", "organization_id")
    _drop_fk("invoices", "payment_id")
    _drop_fk("invoices", "booking_id")
    _drop_fk("invoices", "user_id")
    _drop_fk("invoices", "tenant_id")
    _drop_fk("payment_events", "tenant_id")
    _drop_fk("payment_refunds", "booking_request_id")
    _drop_fk("payment_refunds", "booking_id")
    _drop_fk("payment_refunds", "payment_id")
    _drop_fk("payment_refunds", "tenant_id")
    _drop_fk("payments", "payment_method_id")
    _drop_fk("payments", "booking_series_id")
    _drop_fk("payments", "booking_request_id")
    _drop_fk("payments", "booking_id")
    _drop_fk("payments", "subscription_id")
    _drop_fk("payments", "tenant_id")
    _drop_fk("payments", "user_id")
    _drop_fk("booking_payment_links", "created_by_user_id")
    _drop_fk("booking_payment_links", "booking_request_id")
    _drop_fk("booking_payment_links", "tenant_id")
    _drop_fk("booking_promotions", "promo_code_id")
    _drop_fk("booking_promotions", "booking_request_id")
    _drop_fk("booking_promotions", "booking_id")
    _drop_fk("booking_waitlist_entries", "booking_request_id")
    _drop_fk("booking_waitlist_entries", "membership_plan_id")
    _drop_fk("booking_waitlist_entries", "user_id")
    _drop_fk("booking_waitlist_entries", "space_id")
    _drop_fk("booking_waitlist_entries", "location_id")
    _drop_fk("booking_waitlist_entries", "organization_id")
    _drop_fk("booking_waitlist_entries", "tenant_id")
    _drop_fk("booking_series", "booking_request_id")
    _drop_fk("booking_series", "tenant_id")
    _drop_fk("booking_series", "space_id")
    _drop_fk("booking_series", "user_id")
    _drop_fk("booking_requests", "loyalty_redemption_lock_id")
    _drop_fk("booking_requests", "member_owner_payment_method_id")
    _drop_fk("booking_requests", "owner_payment_setting_id")
    _drop_fk("booking_requests", "membership_plan_id")
    _drop_fk("booking_requests", "created_by_user_id")
    _drop_fk("booking_requests", "booking_series_id")
    _drop_fk("booking_requests", "booking_id")
    _drop_fk("booking_requests", "tenant_id")
    _drop_fk("booking_requests", "space_id")
    _drop_fk("booking_requests", "user_id")
    _drop_fk("bookings", "booking_request_id")
    _drop_fk("bookings", "booking_series_id")
    _drop_fk("bookings", "tenant_id")
    _drop_fk("bookings", "space_id")
    _drop_fk("bookings", "user_id")
