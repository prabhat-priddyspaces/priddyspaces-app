from sqlalchemy import Column, ForeignKey, Integer, JSON

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class BookingPromotion(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "booking_promotions"

    id = Column(Integer, primary_key=True)
    booking_id = Column(Integer, ForeignKey("bookings.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="SET NULL", deferrable=True, initially="DEFERRED"), nullable=True, index=True)
    promo_code_id = Column(Integer, ForeignKey("promo_codes.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    promo_code_snapshot = Column(JSON, nullable=False)
    discount_amount = Column(Integer, nullable=False)
