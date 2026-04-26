from sqlalchemy import Column, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PlatformSetting(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True)
    default_owner_commission_pct = Column(Integer, nullable=False, default=0)
