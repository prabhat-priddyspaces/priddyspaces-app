from sqlalchemy import Column, Integer, String, Boolean

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class FeatureFlag(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "feature_flags"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    flag_key = Column(String(64), nullable=False)
    flag_value = Column(Boolean, nullable=False, default=False)
    scope_type = Column(String(16), nullable=False)  # tenant | space
    scope_id = Column(Integer, nullable=False)
