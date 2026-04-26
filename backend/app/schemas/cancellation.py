from pydantic import BaseModel, ConfigDict


class CancellationPolicyCreate(BaseModel):
    space_type: str
    cancel_window_hours: int
    refund_percent: int


class CancellationPolicyOut(BaseModel):
    public_id: str
    space_type: str
    cancel_window_hours: int
    refund_percent: int

    model_config = ConfigDict(from_attributes=True)
