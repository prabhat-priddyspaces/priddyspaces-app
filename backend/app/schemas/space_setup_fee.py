from pydantic import BaseModel, ConfigDict, Field


class SetupFeeItemOut(BaseModel):
    public_id: str | None = None
    label: str
    amount_cents: int
    is_active: bool = True
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class SetupFeeItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    amount_cents: int = Field(gt=0)
    is_active: bool = True
    sort_order: int = 0


class SetupFeeReplaceIn(BaseModel):
    items: list[SetupFeeItemIn] = Field(max_length=20)
