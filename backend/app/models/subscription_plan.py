from sqlalchemy import Column, Enum, Integer, String, Boolean

from app.models.base import Base
from app.models.enums import BillingCycle, SpaceType, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class SubscriptionPlan(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, default="Membership")
    organization_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    space_type = Column(
        Enum(SpaceType, values_callable=enum_values),
        nullable=False,
    )
    billing_cycle = Column(
        Enum(BillingCycle, values_callable=enum_values),
        nullable=False,
    )
    price = Column(Integer, nullable=False)
    access_rules = Column(Integer, nullable=True)
    stripe_price_id = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
