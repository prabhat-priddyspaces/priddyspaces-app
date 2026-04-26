from sqlalchemy import Boolean, Column, DateTime, Enum, Integer

from app.models.base import Base
from app.models.enums import PlatformTeamRole, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class PlatformTeamMember(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "platform_team_members"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    role = Column(
        Enum(PlatformTeamRole, values_callable=enum_values),
        nullable=False,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    invited_by = Column(Integer, nullable=True)
    invited_at = Column(DateTime(timezone=True), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
