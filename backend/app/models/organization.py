from sqlalchemy import Column, DateTime, Enum, Integer, String

from app.models.base import Base
from app.models.enums import OrganizationReviewStatus, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class Organization(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    owner_id = Column(Integer, nullable=False)
    branding = Column(String(1024), nullable=True)
    stripe_account_id = Column(String(255), nullable=True)
    review_status = Column(
        Enum(OrganizationReviewStatus, values_callable=enum_values),
        nullable=False,
        default=OrganizationReviewStatus.APPROVED,
    )
    review_notes = Column(String(2048), nullable=True)
    reviewed_by_user_id = Column(Integer, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    commission_override_pct = Column(Integer, nullable=True)
