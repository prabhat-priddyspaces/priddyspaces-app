from sqlalchemy import Column, DateTime, Integer, String, Boolean, Enum

from app.models.base import Base
from app.models.enums import UserAppRole, enum_values
from app.models.mixins import PublicIdMixin, TimestampMixin


class User(PublicIdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    auth_subject = Column(String(255), unique=True, index=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)
    role = Column(
        Enum(UserAppRole, values_callable=enum_values),
        nullable=True,
    )
    terms_accepted_at = Column(DateTime(timezone=True), nullable=True)
    privacy_policy_accepted_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_default_payment_method_id = Column(String(255), nullable=True)
