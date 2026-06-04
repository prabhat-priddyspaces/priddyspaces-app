from sqlalchemy import Column, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class EmailSubscriptionGroup(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "email_subscription_groups"
    __table_args__ = (
        UniqueConstraint("email", "asm_group_id", name="uq_email_subscription_groups_email_group"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=True, index=True)
    email = Column(String(320), nullable=False, index=True)
    asm_group_id = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False)
    source_event_id = Column(String(255), nullable=True)
