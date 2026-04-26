from pydantic import BaseModel


class SpacePriceOverride(BaseModel):
    price_monthly: int | None = None
    price_daily: int | None = None
    reason: str
