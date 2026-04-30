from pydantic import BaseModel, ConfigDict, Field


class VolumeDiscountTier(BaseModel):
    """One tier in a space's volume-discount table."""
    public_id: str | None = None
    min_hours: float = Field(gt=0)
    discount_percent: int = Field(gt=0, lt=100)
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class VolumeDiscountTierIn(BaseModel):
    min_hours: float = Field(gt=0)
    discount_percent: int = Field(gt=0, lt=100)
    is_active: bool = True


class VolumeDiscountReplaceIn(BaseModel):
    """Idempotent full-list replacement — simpler than per-tier CRUD."""
    tiers: list[VolumeDiscountTierIn]
