"""Normalize enum-like string columns to lowercase value strings.

Revision ID: 0022_normalize_enum_values
Revises: 0021_platform_admin_superadmin
Create Date: 2026-04-10
"""

from alembic import op

revision = "0022_normalize_enum_values"
down_revision = "0021_platform_admin_superadmin"
branch_labels = None
depends_on = None


UPDATES: tuple[tuple[str, str, dict[str, str]], ...] = (
    ("users", "role", {"OWNER": "owner", "CUSTOMER": "customer"}),
    (
        "organization_members",
        "role",
        {
            "SUPER_ADMIN": "super_admin",
            "OWNER": "owner",
            "ADMIN": "admin",
            "STAFF": "staff",
            "CUSTOMER": "customer",
        },
    ),
    ("organizations", "review_status", {"PENDING": "pending", "APPROVED": "approved", "REJECTED": "rejected"}),
    ("platform_team_members", "role", {"SUPERADMIN": "superadmin", "ADMIN": "admin", "SUPPORT": "support"}),
    ("locations", "status", {"ACTIVE": "active", "INACTIVE": "inactive"}),
    (
        "locations",
        "booking_granularity",
        {"MIN_30": "30m", "MIN_60": "60m", "MIN_120": "120m", "DAILY": "daily"},
    ),
    (
        "spaces",
        "space_type",
        {
            "PRIVATE_OFFICE": "private_office",
            "SHARED_DESK": "shared_desk",
            "CONFERENCE_ROOM": "conference_room",
            "VIRTUAL_OFFICE": "virtual_office",
        },
    ),
    (
        "spaces",
        "availability_status",
        {"AVAILABLE": "available", "OCCUPIED": "occupied", "MAINTENANCE": "maintenance"},
    ),
    ("spaces", "visibility", {"PUBLIC": "public", "UNLISTED": "unlisted", "PRIVATE": "private"}),
    (
        "subscription_plans",
        "space_type",
        {
            "PRIVATE_OFFICE": "private_office",
            "SHARED_DESK": "shared_desk",
            "CONFERENCE_ROOM": "conference_room",
            "VIRTUAL_OFFICE": "virtual_office",
        },
    ),
    (
        "subscription_plans",
        "billing_cycle",
        {"MONTHLY": "monthly", "QUARTERLY": "quarterly", "SIX_MONTH": "six_month", "YEARLY": "yearly"},
    ),
    ("bookings", "status", {"PENDING": "pending", "CONFIRMED": "confirmed", "CANCELED": "canceled"}),
    (
        "booking_requests",
        "status",
        {"REQUESTED": "requested", "APPROVED": "approved", "REJECTED": "rejected"},
    ),
    (
        "payments",
        "status",
        {"REQUIRES_PAYMENT": "requires_payment", "SUCCEEDED": "succeeded", "FAILED": "failed"},
    ),
)


def _apply(mapping_direction: str) -> None:
    for table_name, column_name, mapping in UPDATES:
        effective_mapping = mapping if mapping_direction == "forward" else {new: old for old, new in mapping.items()}
        for old_value, new_value in effective_mapping.items():
            op.execute(
                f"""
                UPDATE {table_name}
                SET {column_name} = '{new_value}'
                WHERE CAST({column_name} AS TEXT) = '{old_value}'
                """
            )


def upgrade() -> None:
    _apply("forward")


def downgrade() -> None:
    _apply("reverse")
