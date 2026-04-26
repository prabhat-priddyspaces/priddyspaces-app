from sqlalchemy import Column, DateTime, String, func

from app.utils.uuid import new_public_id


class PublicIdMixin:
    public_id = Column(String(36), unique=True, index=True, default=new_public_id)


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
