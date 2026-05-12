from pydantic import BaseModel, ConfigDict, Field, model_validator


class CancellationPolicyTierIn(BaseModel):
    min_hours_before_start: int = Field(ge=0)
    refund_percent: int = Field(ge=0, le=100)


class CancellationPolicyTierOut(BaseModel):
    public_id: str | None = None
    min_hours_before_start: int
    refund_percent: int
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class CancellationPolicyCreate(BaseModel):
    space_type: str
    cancel_window_hours: int = 0
    refund_percent: int = 0
    tiers: list[CancellationPolicyTierIn] | None = None

    @model_validator(mode="after")
    def _default_tiers(self):
        if not self.tiers:
            self.tiers = [
                CancellationPolicyTierIn(
                    min_hours_before_start=self.cancel_window_hours,
                    refund_percent=self.refund_percent,
                )
            ]
        return self


class CancellationPolicyOut(BaseModel):
    public_id: str
    space_type: str
    cancel_window_hours: int
    refund_percent: int
    tiers: list[CancellationPolicyTierOut] = []

    model_config = ConfigDict(from_attributes=True)
