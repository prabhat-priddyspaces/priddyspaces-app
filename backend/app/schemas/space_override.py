from pydantic import BaseModel

from app.schemas.money import MoneyAmount


class SpacePriceOverride(BaseModel):
    price_monthly: MoneyAmount | None = None
    price_daily: MoneyAmount | None = None
    reason: str
