from sqlalchemy import Column, Enum, ForeignKey, Integer, JSON, String

from app.models.base import Base
from app.models.enums import PaymentStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Payment(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    amount = Column(Integer, nullable=False)
    amount_cents = Column(Integer, nullable=True)
    subtotal_cents = Column(Integer, nullable=True)
    discount_cents = Column(Integer, nullable=True)
    tax_cents = Column(Integer, nullable=True)
    refunded_amount_cents = Column(Integer, nullable=False, default=0, server_default="0")
    booking_series_id = Column(Integer, ForeignKey("booking_series.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    pricing_snapshot = Column(JSON, nullable=True)
    refund_policy_snapshot = Column(JSON, nullable=True)
    currency = Column(String(3), nullable=False, default="usd", server_default="usd")
    provider = Column(String(32), default="stripe", server_default="stripe")
    payment_method_id = Column(Integer, ForeignKey("member_owner_payment_methods.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True)
    status = Column(
        Enum(PaymentStatus, values_callable=enum_values),
        default=PaymentStatus.REQUIRES_PAYMENT,
    )
    stripe_payment_intent_id = Column(String(255), nullable=True)
    provider_payment_id = Column(String(255), nullable=True)
    provider_reference_id = Column(String(255), nullable=True)
    attempt_number = Column(Integer, nullable=False, default=1, server_default="1")
    idempotency_key = Column(String(255), nullable=True)
    failure_reason = Column(String(1024), nullable=True)
    raw_response = Column(JSON, nullable=True)
    commission_rate_pct = Column(Integer, nullable=True)
    platform_fee_amount = Column(Integer, nullable=True)
    owner_net_amount = Column(Integer, nullable=True)
