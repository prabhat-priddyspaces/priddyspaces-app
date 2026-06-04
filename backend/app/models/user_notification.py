from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class UserNotification(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "user_notifications"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "booking_id",
            "reminder_type",
            "audience",
            name="uq_user_notifications_booking_reminder",
        ),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, nullable=True, index=True)
    organization_id = Column(Integer, nullable=True, index=True)
    booking_id = Column(Integer, nullable=True, index=True)
    booking_request_id = Column(Integer, nullable=True, index=True)
    location_id = Column(Integer, nullable=True, index=True)
    space_id = Column(Integer, nullable=True, index=True)
    audience = Column(String(32), nullable=False, index=True)
    reminder_type = Column(String(32), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    link_url = Column(String(1024), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False, server_default="false", index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    push_status = Column(String(32), nullable=False, default="pending", server_default="pending", index=True)
    push_attempted_at = Column(DateTime(timezone=True), nullable=True)
    push_error = Column(String(1024), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)


class UserNotificationPreference(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "user_notification_preferences"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    booking_start_push_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    booking_end_push_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
