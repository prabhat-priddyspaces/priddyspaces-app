import re

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.space_archetypes import ARCHETYPE_KEYS
from app.services.space_type_registry import VALID_MARKETPLACE_CATEGORIES

_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,62}$")


def _validate_archetype(value: str) -> str:
    if value not in ARCHETYPE_KEYS:
        raise ValueError(f"archetype must be one of {sorted(ARCHETYPE_KEYS)}")
    return value


def _validate_category(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in VALID_MARKETPLACE_CATEGORIES:
        raise ValueError(f"marketplace_category must be one of {sorted(VALID_MARKETPLACE_CATEGORIES)} or null")
    return value


class SpaceTypeOut(BaseModel):
    """Public/owner-facing view of an enabled space type."""

    key: str
    label: str
    description: str | None = None
    icon: str | None = None
    archetype: str
    marketplace_category: str | None = None
    capacity_applicable: bool
    has_physical_inventory: bool
    sort_order: int
    valid_booking_modes: list[str] = []
    default_booking_mode: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SpaceTypeAdminOut(SpaceTypeOut):
    public_id: str
    is_enabled: bool
    is_system: bool


class SpaceTypeCreate(BaseModel):
    key: str
    label: str
    description: str | None = None
    icon: str | None = None
    archetype: str
    marketplace_category: str | None = None
    capacity_applicable: bool = True
    has_physical_inventory: bool = True
    is_enabled: bool = True
    sort_order: int = 0

    @field_validator("key")
    @classmethod
    def _check_key(cls, value: str) -> str:
        value = value.strip().lower()
        if not _KEY_PATTERN.match(value):
            raise ValueError("key must be lowercase snake_case (letters, digits, underscores)")
        return value

    @field_validator("archetype")
    @classmethod
    def _check_archetype(cls, value: str) -> str:
        return _validate_archetype(value)

    @field_validator("marketplace_category")
    @classmethod
    def _check_category(cls, value: str | None) -> str | None:
        return _validate_category(value)


class SpaceTypeUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    icon: str | None = None
    archetype: str | None = None
    marketplace_category: str | None = None
    capacity_applicable: bool | None = None
    has_physical_inventory: bool | None = None
    is_enabled: bool | None = None
    sort_order: int | None = None

    @field_validator("archetype")
    @classmethod
    def _check_archetype(cls, value: str | None) -> str | None:
        return _validate_archetype(value) if value is not None else None

    @field_validator("marketplace_category")
    @classmethod
    def _check_category(cls, value: str | None) -> str | None:
        return _validate_category(value) if value is not None else None


class SpaceTypeReorderItem(BaseModel):
    public_id: str
    sort_order: int


class SpaceTypeReorderIn(BaseModel):
    items: list[SpaceTypeReorderItem]
