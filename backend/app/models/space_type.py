from sqlalchemy import Boolean, Column, Integer, String

from app.models.base import Base
from app.models.mixins import PublicIdMixin, TimestampMixin


class SpaceTypeRegistry(PublicIdMixin, TimestampMixin, Base):
    """Super-admin-managed registry of space types.

    The ``key`` column holds the stable string persisted on
    ``spaces.space_type``. ``archetype`` references one of the fixed behavior
    archetypes in ``app.services.space_archetypes`` and drives valid booking
    modes, pricing fields, and inventory model.
    """

    __tablename__ = "space_types"

    id = Column(Integer, primary_key=True)
    key = Column(String(64), nullable=False, unique=True, index=True)
    label = Column(String(128), nullable=False)
    description = Column(String(512), nullable=True)
    icon = Column(String(64), nullable=True)
    archetype = Column(String(32), nullable=False)
    marketplace_category = Column(String(32), nullable=True)
    capacity_applicable = Column(Boolean, nullable=False, default=True, server_default="true")
    has_physical_inventory = Column(Boolean, nullable=False, default=True, server_default="true")
    is_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    sort_order = Column(Integer, nullable=False, default=0, server_default="0", index=True)
    is_system = Column(Boolean, nullable=False, default=False, server_default="false")
