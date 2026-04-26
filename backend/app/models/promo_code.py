from sqlalchemy import Column, DateTime, Integer, String, Boolean

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PromoCode(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "promo_codes"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    code = Column(String(64), nullable=False)
    discount_type = Column(String(16), nullable=False)  # percent | fixed
    discount_value = Column(Integer, nullable=False)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
