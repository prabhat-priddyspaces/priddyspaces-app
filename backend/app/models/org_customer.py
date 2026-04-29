from sqlalchemy import Column, Integer, String, Text, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class OrgCustomer(PublicIdMixin, TimestampMixin, Base):
    """Owner-scoped CRM record for a customer who has interacted with this org.

    Stores only owner-authored fields (notes, tags, status, phone, company_name).
    Booking/revenue stats are computed on read by `org_customer_stats` to avoid
    cache drift after refunds, cancellations, etc.
    """
    __tablename__ = "org_customers"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_customers_org_user"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False)
    user_id = Column(Integer, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="active", server_default="active")
    notes = Column(Text, nullable=True)
    tags = Column(String(1024), nullable=True)
    phone = Column(String(64), nullable=True)
    company_name = Column(String(255), nullable=True)
    created_by_user_id = Column(Integer, nullable=True)
