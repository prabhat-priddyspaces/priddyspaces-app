from sqlalchemy import Boolean, Column, Date, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class Subscription(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    space_id = Column(Integer, nullable=False)
    tenant_id = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True)

    membership_plan_id = Column(Integer, nullable=True)
    booking_mode = Column(String(32), nullable=True)
    commitment_months = Column(Integer, nullable=True)
    commitment_start_date = Column(Date, nullable=True)
    commitment_end_date = Column(Date, nullable=True)
    included_meeting_room_hours_per_month = Column(
        Integer, nullable=False, default=0, server_default="0"
    )
    auto_renew = Column(Boolean, nullable=False, default=False, server_default="false")
