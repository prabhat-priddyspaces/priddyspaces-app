from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.enums import UserRole, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class OrganizationMember(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "organization_members"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_organization_members_org_user"),
    )

    id = Column(Integer, primary_key=True)
    clerk_membership_id = Column(String(255), nullable=True, unique=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    role = Column(
        Enum(UserRole, values_callable=enum_values),
        nullable=False,
    )
    is_active = Column(Boolean, default=True)
    can_override_pricing = Column(Boolean, default=False)
    receives_new_booking_email = Column(Boolean, default=False, server_default="false")
    receives_booking_start_push = Column(Boolean, default=True, server_default="true")
    receives_booking_end_push = Column(Boolean, default=True, server_default="true")
