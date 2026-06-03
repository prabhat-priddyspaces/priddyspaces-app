from sqlalchemy import Boolean, Column, DateTime, Enum, Integer, String

from app.models.base import Base
from app.models.enums import OrganizationReviewStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Organization(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    clerk_org_id = Column(String(255), nullable=True, unique=True, index=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(Integer, nullable=False)
    onboarding_completed = Column(Boolean, default=False, nullable=False)
    branding = Column(String(1024), nullable=True)
    industry = Column(String(128), nullable=True)
    size = Column(String(32), nullable=True)
    website = Column(String(512), nullable=True)
    display_name = Column(String(255), nullable=True)
    business_email = Column(String(255), nullable=True)
    business_phone = Column(String(64), nullable=True)
    description = Column(String(2048), nullable=True)
    stripe_account_id = Column(String(255), nullable=True)
    payment_provider = Column(String(32), nullable=True)
    review_status = Column(
        Enum(OrganizationReviewStatus, values_callable=enum_values),
        nullable=False,
        default=OrganizationReviewStatus.PENDING,
    )
    review_notes = Column(String(2048), nullable=True)
    reviewed_by_user_id = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    commission_override_pct = Column(Integer, nullable=True)
    booking_approval_mode = Column(String(16), nullable=False, default="manual", server_default="manual")
    membership_lease_approval_mode = Column(String(16), nullable=False, default="manual", server_default="manual")
    payment_failure_hold_minutes = Column(Integer, nullable=False, default=30, server_default="30")
    waitlist_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    waitlist_conference_room_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    waitlist_private_office_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    waitlist_shared_desk_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    waitlist_suite_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    waitlist_virtual_office_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    allowed_marketing_lanes = Column(String(255), nullable=False, default="shared,verified_sender", server_default="shared,verified_sender")
    default_marketing_lane = Column(String(32), nullable=False, default="shared", server_default="shared")
    shared_daily_cap = Column(Integer, nullable=False, default=500, server_default="500")
    verified_sender_daily_cap = Column(Integer, nullable=False, default=2000, server_default="2000")
    allow_business_sender_overrides = Column(Boolean, nullable=False, default=True, server_default="true")
