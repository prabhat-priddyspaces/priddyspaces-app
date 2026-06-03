from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceSetupFeeItem(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "space_setup_fee_items"

    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id", ondelete="RESTRICT"), nullable=False, index=True)
    label = Column(String(120), nullable=False)
    amount_cents = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0")
