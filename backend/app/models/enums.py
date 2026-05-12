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
    SUITE = "suite"


class BookingMode(str, enum.Enum):
    HOURLY = "hourly"
    DAY_PASS = "day_pass"
    MONTHLY_MEMBERSHIP = "monthly_membership"
    VIRTUAL_MEMBERSHIP = "virtual_membership"
    PRIVATE_OFFICE_LEASE = "private_office_lease"
    SUITE_LEASE = "suite_lease"


class BookingRequestKind(str, enum.Enum):
    HOURLY_BOOKING = "hourly_booking"
    DAILY_BOOKING = "daily_booking"
    MEMBERSHIP_PURCHASE = "membership_purchase"
    LEASE_PURCHASE = "lease_purchase"


class SubscriptionStatusEnum(str, enum.Enum):
    PENDING_APPROVAL = "pending_approval"
    PENDING_PAYMENT = "pending_payment"
    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELING = "canceling"
    CANCELED = "canceled"
    EXPIRED = "expired"
    COMMITMENT_BREACH = "commitment_breach"


class LedgerEntryType(str, enum.Enum):
    GRANT = "grant"
    USAGE = "usage"
    ADJUSTMENT = "adjustment"
    EXPIRY = "expiry"


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
    PAYMENT_FAILED = "payment_failed"
    CANCELLED = "cancelled"


class PaymentStatus(str, enum.Enum):
    REQUIRES_PAYMENT = "requires_payment"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    PARTIALLY_REFUNDED = "partially_refunded"
    REFUNDED = "refunded"
    VOIDED = "voided"


class BookingGranularity(str, enum.Enum):
    MIN_30 = "30m"
    MIN_60 = "60m"
    MIN_120 = "120m"
    DAILY = "daily"
