from sqlalchemy import Column, Enum, Integer, Boolean

from app.models.base import Base
from app.models.enums import UserRole, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class OrganizationMember(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "organization_members"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    role = Column(
        Enum(UserRole, values_callable=enum_values),
        nullable=False,
    )
    is_active = Column(Boolean, default=True)
    can_override_pricing = Column(Boolean, default=False)
