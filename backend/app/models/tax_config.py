from sqlalchemy import Column, Float, ForeignKey, Integer

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class TaxConfig(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "tax_configs"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, unique=True)
    rate_percent = Column(Float, nullable=False, default=0.0)
