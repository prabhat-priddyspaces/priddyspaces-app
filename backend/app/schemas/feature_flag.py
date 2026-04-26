from pydantic import BaseModel, ConfigDict


class FeatureFlagCreate(BaseModel):
    flag_key: str
    flag_value: bool
    scope_type: str  # tenant | space
    scope_public_id: str


class FeatureFlagOut(BaseModel):
    public_id: str
    flag_key: str
    flag_value: bool
    scope_type: str
    scope_id: int

    model_config = ConfigDict(from_attributes=True)
