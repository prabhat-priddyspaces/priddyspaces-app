from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    amount: float
    status: str
    booking_id: int | None
    booking_public_id: str | None = None
    booking_start_datetime: datetime | None = None
    booking_end_datetime: datetime | None = None
    payment_id: int | None
    payment_public_id: str | None = None
    payment_provider: str | None = None
    payment_status: str | None = None
    subscription_public_id: str | None = None
    subscription_start_date: str | None = None
    subscription_end_date: str | None = None
    space_public_id: str | None = None
    space_name: str | None = None
    space_type: str | None = None
    location_public_id: str | None = None
    location_name: str | None = None
    location_city: str | None = None
    member_name: str | None = None
    member_email: str | None = None
    description: str | None = None
    pdf_url: str | None
    created_at: datetime | None = None
