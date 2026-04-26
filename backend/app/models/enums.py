import enum


def enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    OWNER = "owner"
    ADMIN = "admin"
    STAFF = "staff"
    CUSTOMER = "customer"


class UserAppRole(str, enum.Enum):
    """User-level role: owner (manages locations) or customer (books spaces)."""
    OWNER = "owner"
    CUSTOMER = "customer"


class PlatformTeamRole(str, enum.Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    SUPPORT = "support"


class OrganizationReviewStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class LocationStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class SpaceType(str, enum.Enum):
    PRIVATE_OFFICE = "private_office"
    SHARED_DESK = "shared_desk"
    CONFERENCE_ROOM = "conference_room"
    VIRTUAL_OFFICE = "virtual_office"


class AvailabilityStatus(str, enum.Enum):
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    MAINTENANCE = "maintenance"


class SpaceVisibility(str, enum.Enum):
    PUBLIC = "public"
    UNLISTED = "unlisted"
    PRIVATE = "private"


class BillingCycle(str, enum.Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SIX_MONTH = "six_month"
    YEARLY = "yearly"


class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELED = "canceled"


class BookingRequestStatus(str, enum.Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"


class PaymentStatus(str, enum.Enum):
    REQUIRES_PAYMENT = "requires_payment"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class BookingGranularity(str, enum.Enum):
    MIN_30 = "30m"
    MIN_60 = "60m"
    MIN_120 = "120m"
    DAILY = "daily"
