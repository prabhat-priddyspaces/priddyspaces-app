from sqlalchemy import Boolean, Column, Integer, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PlatformSetting(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True)
    default_owner_commission_pct = Column(Integer, nullable=False, default=0)
    priddy_points_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    priddy_signup_points = Column(Integer, nullable=False, default=1000, server_default="1000")
    priddy_point_value_cents = Column(Integer, nullable=False, default=1, server_default="1")
    priddy_allowed_space_types = Column(JSON, nullable=False, default=lambda: ["shared_desk"])
    priddy_allowed_booking_modes = Column(JSON, nullable=False, default=lambda: ["day_pass"])
