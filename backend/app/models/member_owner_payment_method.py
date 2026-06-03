from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class MemberOwnerPaymentMethod(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "member_owner_payment_methods"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)
    owner_payment_setting_id = Column(Integer, ForeignKey("owner_payment_settings.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False)

    provider_customer_id = Column(String(255), nullable=True)
    provider_payment_method_id = Column(String(255), nullable=True)
    card_token = Column(String(1024), nullable=True)

    last4 = Column(String(4), nullable=True)
    brand = Column(String(64), nullable=True)
    exp_month = Column(Integer, nullable=True)
    exp_year = Column(Integer, nullable=True)

    is_default_for_owner = Column(Boolean, nullable=False, default=False, server_default="false")
    status = Column(String(32), nullable=False, default="active", server_default="active")
    billing_name = Column(String(255), nullable=True)
    billing_zip = Column(String(32), nullable=True)
