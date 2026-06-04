from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceAccessPass(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_access_passes"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, unique=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    token_encrypted = Column(String(768), nullable=False)
    valid_from_at = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="active", server_default="active", index=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_reason = Column(String(255), nullable=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
