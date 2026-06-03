"""Validate foreign key constraints added in migration 0056

This migration runs VALIDATE CONSTRAINT for every FK added with NOT VALID.
It uses ShareUpdateExclusiveLock which does not block reads or writes —
safe to run on a live database.

Revision ID: 0057_validate_fk_constraints
Revises: 0056_add_fk_constraints_not_valid
Create Date: 2026-06-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0057_validate_fk_constraints"
down_revision = "0056_add_fk_constraints_not_valid"
branch_labels = None
depends_on = None


def _validate(table: str, column: str) -> None:
    name = f"fk_{table}_{column}"
    op.execute(sa.text(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}"))


def upgrade() -> None:
    # Bookings
    _validate("bookings", "user_id")
    _validate("bookings", "space_id")
    _validate("bookings", "tenant_id")
    _validate("bookings", "booking_series_id")
    _validate("bookings", "booking_request_id")

    # Booking requests
    _validate("booking_requests", "user_id")
    _validate("booking_requests", "space_id")
    _validate("booking_requests", "tenant_id")
    _validate("booking_requests", "booking_id")
    _validate("booking_requests", "booking_series_id")
    _validate("booking_requests", "created_by_user_id")
    _validate("booking_requests", "membership_plan_id")
    _validate("booking_requests", "owner_payment_setting_id")
    _validate("booking_requests", "member_owner_payment_method_id")
    _validate("booking_requests", "loyalty_redemption_lock_id")

    # Booking series
    _validate("booking_series", "user_id")
    _validate("booking_series", "space_id")
    _validate("booking_series", "tenant_id")
    _validate("booking_series", "booking_request_id")

    # Booking waitlist
    _validate("booking_waitlist_entries", "tenant_id")
    _validate("booking_waitlist_entries", "organization_id")
    _validate("booking_waitlist_entries", "location_id")
    _validate("booking_waitlist_entries", "space_id")
    _validate("booking_waitlist_entries", "user_id")
    _validate("booking_waitlist_entries", "membership_plan_id")
    _validate("booking_waitlist_entries", "booking_request_id")

    # Booking promotions & links
    _validate("booking_promotions", "booking_id")
    _validate("booking_promotions", "booking_request_id")
    _validate("booking_promotions", "promo_code_id")
    _validate("booking_payment_links", "tenant_id")
    _validate("booking_payment_links", "booking_request_id")
    _validate("booking_payment_links", "created_by_user_id")

    # Payments
    _validate("payments", "user_id")
    _validate("payments", "tenant_id")
    _validate("payments", "subscription_id")
    _validate("payments", "booking_id")
    _validate("payments", "booking_request_id")
    _validate("payments", "booking_series_id")
    _validate("payments", "payment_method_id")

    # Payment refunds & events
    _validate("payment_refunds", "tenant_id")
    _validate("payment_refunds", "payment_id")
    _validate("payment_refunds", "booking_id")
    _validate("payment_refunds", "booking_request_id")
    _validate("payment_events", "tenant_id")

    # Subscriptions
    _validate("subscriptions", "user_id")
    _validate("subscriptions", "space_id")
    _validate("subscriptions", "tenant_id")
    _validate("subscriptions", "membership_plan_id")

    # Invoices
    _validate("invoices", "tenant_id")
    _validate("invoices", "user_id")
    _validate("invoices", "booking_id")
    _validate("invoices", "payment_id")

    # Core hierarchy
    _validate("locations", "organization_id")
    _validate("locations", "tenant_id")
    _validate("spaces", "location_id")
    _validate("spaces", "tenant_id")
    _validate("spaces", "floor_plan_id")
    _validate("organizations", "owner_id")
    _validate("organizations", "reviewed_by_user_id")

    # Members
    _validate("organization_members", "organization_id")
    _validate("organization_members", "tenant_id")
    _validate("organization_members", "user_id")
    _validate("org_member_profiles", "organization_id")
    _validate("org_member_profiles", "tenant_id")
    _validate("org_member_profiles", "user_id")
    _validate("org_member_profiles", "created_by_user_id")

    # Access passes & attendance
    _validate("space_access_passes", "tenant_id")
    _validate("space_access_passes", "booking_id")
    _validate("space_access_passes", "booking_request_id")
    _validate("space_access_passes", "location_id")
    _validate("space_access_passes", "space_id")
    _validate("space_access_passes", "user_id")
    _validate("space_attendance_records", "tenant_id")
    _validate("space_attendance_records", "access_pass_id")
    _validate("space_attendance_records", "booking_id")
    _validate("space_attendance_records", "location_id")
    _validate("space_attendance_records", "space_id")
    _validate("space_attendance_records", "member_id")
    _validate("space_attendance_records", "scanned_by_user_id")

    # Policies
    _validate("cancellation_policies", "tenant_id")
    _validate("cancellation_policy_tiers", "cancellation_policy_id")
    _validate("pricing_rules", "tenant_id")
    _validate("pricing_rules", "space_id")

    # Plans
    _validate("membership_plans", "tenant_id")
    _validate("membership_plans", "organization_id")
    _validate("membership_plans", "space_id")
    _validate("subscription_plans", "organization_id")
    _validate("subscription_plans", "tenant_id")

    # Floor plans
    _validate("floor_plans", "location_id")
    _validate("floor_plans", "tenant_id")
    _validate("floor_plan_markers", "floor_plan_id")
    _validate("floor_plan_markers", "space_id")
    _validate("floor_plan_markers", "tenant_id")

    # Location admins
    _validate("location_admins", "location_id")
    _validate("location_admins", "user_id")
    _validate("location_admins", "tenant_id")

    # Space sub-tables
    _validate("space_images", "tenant_id")
    _validate("space_images", "space_id")
    _validate("space_setup_fee_items", "tenant_id")
    _validate("space_setup_fee_items", "space_id")
    _validate("space_volume_discounts", "organization_id")
    _validate("space_volume_discounts", "tenant_id")
    _validate("space_volume_discounts", "space_id")
    _validate("space_booking_modes", "tenant_id")
    _validate("space_booking_modes", "space_id")

    # Payment methods
    _validate("owner_payment_settings", "organization_id")
    _validate("owner_payment_settings", "tenant_id")
    _validate("member_owner_payment_methods", "user_id")
    _validate("member_owner_payment_methods", "organization_id")
    _validate("member_owner_payment_methods", "tenant_id")
    _validate("member_owner_payment_methods", "owner_payment_setting_id")

    # Misc
    _validate("feature_flags", "tenant_id")
    _validate("tax_configs", "tenant_id")
    _validate("promo_codes", "tenant_id")
    _validate("audit_logs", "acting_as_user_id")
    _validate("user_notifications", "user_id")
    _validate("push_subscriptions", "user_id")
    _validate("platform_team_members", "user_id")
    _validate("platform_team_members", "invited_by")
    _validate("meeting_room_hour_ledger", "tenant_id")
    _validate("meeting_room_hour_ledger", "subscription_id")
    _validate("meeting_room_hour_ledger", "booking_id")

    # Loyalty
    _validate("loyalty_owner_settings", "organization_id")
    _validate("loyalty_owner_settings", "tenant_id")
    _validate("loyalty_wallets", "organization_id")
    _validate("loyalty_wallets", "tenant_id")
    _validate("loyalty_wallets", "user_id")
    _validate("loyalty_campaigns", "organization_id")
    _validate("loyalty_campaigns", "tenant_id")
    _validate("loyalty_campaigns", "created_by_user_id")
    _validate("loyalty_redemption_locks", "organization_id")
    _validate("loyalty_redemption_locks", "tenant_id")
    _validate("loyalty_redemption_locks", "user_id")
    _validate("loyalty_redemption_locks", "booking_request_id")
    _validate("loyalty_redemption_locks", "space_id")
    _validate("loyalty_redemptions", "organization_id")
    _validate("loyalty_redemptions", "tenant_id")
    _validate("loyalty_redemptions", "user_id")
    _validate("loyalty_redemptions", "booking_request_id")
    _validate("loyalty_redemptions", "booking_id")
    _validate("loyalty_redemptions", "payment_id")
    _validate("loyalty_ledger_entries", "organization_id")
    _validate("loyalty_ledger_entries", "tenant_id")
    _validate("loyalty_ledger_entries", "user_id")
    _validate("loyalty_ledger_entries", "campaign_id")
    _validate("loyalty_ledger_entries", "booking_request_id")
    _validate("loyalty_ledger_entries", "booking_id")
    _validate("loyalty_ledger_entries", "payment_id")
    _validate("loyalty_ledger_entries", "redemption_id")
    _validate("loyalty_ledger_entries", "redemption_lock_id")
    _validate("priddy_points_wallets", "user_id")
    _validate("priddy_points_ledger_entries", "user_id")
    _validate("priddy_points_ledger_entries", "booking_request_id")
    _validate("priddy_points_ledger_entries", "booking_id")
    _validate("priddy_points_ledger_entries", "payment_id")
    _validate("priddy_points_ledger_entries", "redemption_id")
    _validate("priddy_points_ledger_entries", "redemption_lock_id")


def downgrade() -> None:
    # NOT VALID constraints cannot be "un-validated"; downgrade is a no-op.
    # To remove the constraints, downgrade migration 0056.
    pass
