from sqlalchemy import Column, Enum, Integer, String

from app.models.base import Base
from app.models.enums import PaymentStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Payment(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    subscription_id = Column(Integer, nullable=True)
    booking_id = Column(Integer, nullable=True)
    tenant_id = Column(Integer, nullable=True)
    amount = Column(Integer, nullable=False)
    provider = Column(String(32), default="stripe")
    status = Column(
        Enum(PaymentStatus, values_callable=enum_values),
        default=PaymentStatus.REQUIRES_PAYMENT,
    )
    stripe_payment_intent_id = Column(String(255), nullable=True)
    commission_rate_pct = Column(Integer, nullable=True)
    platform_fee_amount = Column(Integer, nullable=True)
    owner_net_amount = Column(Integer, nullable=True)
