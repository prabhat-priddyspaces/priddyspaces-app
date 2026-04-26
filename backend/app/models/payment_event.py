from sqlalchemy import Column, Integer, String, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class PaymentEvent(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "payment_events"

    id = Column(Integer, primary_key=True)
    provider = Column(String(32), default="stripe")
    tenant_id = Column(Integer, nullable=True)
    event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(128), nullable=False)
    payload = Column(JSON, nullable=True)
