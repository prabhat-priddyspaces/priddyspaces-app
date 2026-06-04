from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceImage(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_images"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    image_url = Column(String(1024), nullable=False)
    storage_key = Column(String(512), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False, server_default="false")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
