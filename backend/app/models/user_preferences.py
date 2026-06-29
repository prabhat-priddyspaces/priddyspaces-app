from sqlalchemy import Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class UserPreference(PublicIdMixin, TimestampMixin, Base):
    """Per-user UI preferences (one row per user).

    Mirrors the UserNotificationPreference pattern: a dedicated one-to-one
    table so we can add more preferences (locale, timezone, …) without
    touching the hot users table.
    """

    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    theme_family = Column(String(32), nullable=False, default="neutral", server_default="neutral")
    theme_mode = Column(String(16), nullable=False, default="system", server_default="system")
