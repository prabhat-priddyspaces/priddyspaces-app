from sqlalchemy import Column, Date, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class MeetingRoomHourLedger(PublicIdMixin, TimestampMixin, Base):
    """Append-only ledger of meeting-room minutes granted/used/expired per Subscription per period.

    Balance for a period is SUM(hours_delta_minutes) over rows whose
    [billing_period_start, billing_period_end) covers the date in question.
    """

    __tablename__ = "meeting_room_hour_ledger"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, nullable=False)
    subscription_id = Column(Integer, nullable=False, index=True)
    booking_id = Column(Integer, nullable=True)
    billing_period_start = Column(Date, nullable=False)
    billing_period_end = Column(Date, nullable=False)
    entry_type = Column(String(32), nullable=False)
    hours_delta_minutes = Column(Integer, nullable=False)
    description = Column(String(1024), nullable=True)
