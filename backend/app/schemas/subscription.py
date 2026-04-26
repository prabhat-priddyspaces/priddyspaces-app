from datetime import date
from pydantic import BaseModel, ConfigDict


class SubscriptionCreate(BaseModel):
    space_public_id: str
    start_date: date
    end_date: date | None = None


class SubscriptionOut(BaseModel):
    public_id: str
    space_id: int
    space_public_id: str | None = None
    space_type: str | None = None
    location_name: str | None = None
    status: str
    start_date: date
    end_date: date | None
    stripe_subscription_id: str | None = None
    model_config = ConfigDict(from_attributes=True)
