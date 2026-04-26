from sqlalchemy import Column, Date, Integer, String

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
