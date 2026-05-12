from sqlalchemy import Boolean, Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class MemberOwnerPaymentMethod(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "member_owner_payment_methods"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    organization_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    provider = Column(String(32), nullable=False)
    owner_payment_setting_id = Column(Integer, nullable=False)

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
