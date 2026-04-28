from sqlalchemy import Boolean, Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class MembershipPlan(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "membership_plans"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    organization_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False, index=True)
    booking_mode = Column(String(32), nullable=False)

    name = Column(String(120), nullable=False)
    description = Column(String(1024), nullable=True)

    price_cents = Column(Integer, nullable=False)
    billing_cycle = Column(String(32), nullable=False, default="monthly", server_default="monthly")
    stripe_price_id = Column(String(255), nullable=True)

    commitment_months = Column(Integer, nullable=True)
    auto_renew = Column(Boolean, nullable=False, default=False, server_default="false")

    included_meeting_room_hours_per_month = Column(Integer, nullable=False, default=0, server_default="0")
    overage_hourly_rate_cents = Column(Integer, nullable=True)

    seats_per_plan = Column(Integer, nullable=False, default=1, server_default="1")
    max_active_subscriptions = Column(Integer, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
