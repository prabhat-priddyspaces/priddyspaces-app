"""Space-type behavior archetypes.

A space type's *behavior* (which booking modes are valid, whether it holds
physical inventory, whether that inventory is pooled, etc.) is determined by a
small, fixed set of code-defined archetypes — NOT by free-form admin input.
This is what lets super admins create new space types in the registry while the
booking/payment/inventory engine keeps working: a new type simply reuses one of
these proven archetypes.

The seven built-in space types are defined here as the single source of truth
consumed by the ORM seeding helper, the Alembic seed migration, and the test
fixtures.
"""
from __future__ import annotations

from app.models.enums import BookingMode


# ── Archetype keys ──────────────────────────────────────────────────────────
PRIVATE_OFFICE_LEASE = "private_office_lease"
SUITE_LEASE = "suite_lease"
DESK_POOL = "desk_pool"
ROOM_HOURLY = "room_hourly"
VIRTUAL = "virtual"

ARCHETYPE_KEYS: set[str] = {
    PRIVATE_OFFICE_LEASE,
    SUITE_LEASE,
    DESK_POOL,
    ROOM_HOURLY,
    VIRTUAL,
}


# ── Archetype → behavior ────────────────────────────────────────────────────
VALID_BOOKING_MODES_BY_ARCHETYPE: dict[str, set[BookingMode]] = {
    PRIVATE_OFFICE_LEASE: {BookingMode.PRIVATE_OFFICE_LEASE},
    SUITE_LEASE: {BookingMode.SUITE_LEASE},
    DESK_POOL: {BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP},
    ROOM_HOURLY: {BookingMode.HOURLY, BookingMode.DAY_PASS},
    VIRTUAL: {BookingMode.VIRTUAL_MEMBERSHIP},
}

# A direct (non-plan) booking mode created automatically when a space of this
# archetype is created. Plan-based archetypes (lease / membership / virtual) get
# no default SpaceBookingMode row — they are configured via membership plans.
DEFAULT_DIRECT_MODE_BY_ARCHETYPE: dict[str, BookingMode] = {
    ROOM_HOURLY: BookingMode.HOURLY,
    DESK_POOL: BookingMode.DAY_PASS,
}

ARCHETYPES_WITH_PHYSICAL_INVENTORY: set[str] = {
    PRIVATE_OFFICE_LEASE,
    SUITE_LEASE,
    DESK_POOL,
    ROOM_HOURLY,
}

POOLED_INVENTORY_ARCHETYPES: set[str] = {DESK_POOL}

EXCLUSIVE_LEASE_ARCHETYPES: set[str] = {PRIVATE_OFFICE_LEASE, SUITE_LEASE}

# Archetypes that support instant (no-approval) booking of a single slot.
INSTANT_BOOKING_ARCHETYPES: set[str] = {ROOM_HOURLY, DESK_POOL}


# ── Built-in space types (single source of truth) ───────────────────────────
# Each dict mirrors the columns of the ``space_types`` registry table. ``key``
# is the stable string persisted on ``spaces.space_type``.
SYSTEM_SPACE_TYPES: list[dict] = [
    {
        "key": "private_office",
        "label": "Private Office",
        "description": "A fully enclosed private office leased by the month.",
        "icon": "building",
        "archetype": PRIVATE_OFFICE_LEASE,
        "marketplace_category": "private_office",
        "capacity_applicable": True,
        "has_physical_inventory": True,
        "is_enabled": True,
        "sort_order": 10,
        "is_system": True,
    },
    {
        "key": "shared_desk",
        "label": "Shared Desk",
        "description": "Pooled coworking seats available by day pass or monthly membership.",
        "icon": "users",
        "archetype": DESK_POOL,
        "marketplace_category": "coworking",
        "capacity_applicable": True,
        "has_physical_inventory": True,
        "is_enabled": True,
        "sort_order": 20,
        "is_system": True,
    },
    {
        "key": "conference_room",
        "label": "Conference Room",
        "description": "A meeting room bookable by the hour or for the full day.",
        "icon": "presentation",
        "archetype": ROOM_HOURLY,
        "marketplace_category": "meeting_room",
        "capacity_applicable": True,
        "has_physical_inventory": True,
        "is_enabled": True,
        "sort_order": 30,
        "is_system": True,
    },
    {
        "key": "virtual_office",
        "label": "Virtual Office",
        "description": "A professional business address and mail handling with no physical desk.",
        "icon": "mail",
        "archetype": VIRTUAL,
        "marketplace_category": None,
        "capacity_applicable": False,
        "has_physical_inventory": False,
        "is_enabled": True,
        "sort_order": 40,
        "is_system": True,
    },
    {
        "key": "suite",
        "label": "Suite",
        "description": "A larger multi-room office suite leased by the month.",
        "icon": "building-2",
        "archetype": SUITE_LEASE,
        "marketplace_category": None,
        "capacity_applicable": True,
        "has_physical_inventory": True,
        "is_enabled": True,
        "sort_order": 50,
        "is_system": True,
    },
    {
        "key": "event_space",
        "label": "Event Space",
        "description": "A large-capacity space for events, bookable by the hour or full day.",
        "icon": "calendar",
        "archetype": ROOM_HOURLY,
        "marketplace_category": "meeting_room",
        "capacity_applicable": True,
        "has_physical_inventory": True,
        "is_enabled": True,
        "sort_order": 60,
        "is_system": True,
    },
    {
        "key": "business_address",
        "label": "Business Address",
        "description": "A prestigious business mailing address with no physical workspace.",
        "icon": "map-pin",
        "archetype": VIRTUAL,
        "marketplace_category": None,
        "capacity_applicable": False,
        "has_physical_inventory": False,
        "is_enabled": True,
        "sort_order": 70,
        "is_system": True,
    },
]

# Static key → archetype map for the built-in types. Used by pure-Python code
# paths that have no DB session; admin-created types are resolved from the
# registry via ``resolve_archetype``.
ARCHETYPE_BY_SYSTEM_KEY: dict[str, str] = {
    row["key"]: row["archetype"] for row in SYSTEM_SPACE_TYPES
}


def space_type_key(space_type) -> str:
    """Return the stable string key for an enum member or plain string."""
    return getattr(space_type, "value", space_type)
