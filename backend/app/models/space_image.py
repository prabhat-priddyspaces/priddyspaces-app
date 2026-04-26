from sqlalchemy import Column, Integer, String, Boolean

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceImage(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_images"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False)
    image_url = Column(String(1024), nullable=False)
    storage_key = Column(String(512), nullable=False)
    is_primary = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
