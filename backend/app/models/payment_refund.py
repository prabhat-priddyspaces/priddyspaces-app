from sqlalchemy import Column, Integer, JSON, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PaymentRefund(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "payment_refunds"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    payment_id = Column(Integer, nullable=False, index=True)
    booking_id = Column(Integer, nullable=True, index=True)
    booking_request_id = Column(Integer, nullable=True, index=True)
    amount_cents = Column(Integer, nullable=False)
    refund_percent = Column(Integer, nullable=False)
    provider = Column(String(32), nullable=False)
    provider_refund_id = Column(String(255), nullable=True)
    provider_reference_id = Column(String(255), nullable=True)
    status = Column(String(32), nullable=False, default="pending", server_default="pending")
    idempotency_key = Column(String(255), nullable=False, unique=True, index=True)
    failure_reason = Column(String(1024), nullable=True)
    raw_response = Column(JSON, nullable=True)
