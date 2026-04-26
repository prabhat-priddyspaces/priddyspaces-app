from sqlalchemy import Column, Integer, String, Float

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class Invoice(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False)
    booking_id = Column(Integer, nullable=True)
    payment_id = Column(Integer, nullable=True)
    amount = Column(Float, nullable=False)
    status = Column(String(32), nullable=False, default="issued")
    pdf_url = Column(String(1024), nullable=True)
    commission_rate_pct = Column(Integer, nullable=True)
    platform_fee_amount = Column(Float, nullable=True)
    owner_net_amount = Column(Float, nullable=True)
