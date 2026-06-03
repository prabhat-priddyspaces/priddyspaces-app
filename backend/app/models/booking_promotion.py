from sqlalchemy import Column, Integer, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingPromotion(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_promotions"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, nullable=True, index=True)
    booking_request_id = Column(Integer, nullable=True, index=True)
    promo_code_id = Column(Integer, nullable=False, index=True)
    promo_code_snapshot = Column(JSON, nullable=False)
    discount_amount = Column(Integer, nullable=False)
