from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class OwnerPaymentSetting(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "owner_payment_settings"
    __table_args__ = (
        UniqueConstraint("organization_id", "provider", name="uq_owner_payment_settings_org_provider"),
    )

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    tenant_id = Column(Integer, ForeignKey("organizations.id", ondelete="RESTRICT", deferrable=True, initially="DEFERRED"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=False, server_default="false")
    is_test_mode = Column(Boolean, nullable=False, default=True, server_default="true")

    stripe_publishable_key = Column(String(255), nullable=True)
    stripe_secret_key_encrypted = Column(String(4096), nullable=True)
    stripe_webhook_secret_encrypted = Column(String(4096), nullable=True)

    cardpointe_merchant_id = Column(String(255), nullable=True)
    cardpointe_username_encrypted = Column(String(4096), nullable=True)
    cardpointe_password_encrypted = Column(String(4096), nullable=True)
    cardpointe_site = Column(String(512), nullable=True)
    cardpointe_tokenizer_url = Column(String(1024), nullable=True)

    connection_status = Column(String(32), nullable=False, default="not_tested", server_default="not_tested")
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
