from datetime import datetime

from pydantic import BaseModel, ConfigDict


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    public_id: str
    amount: float
    status: str
    booking_id: int | None
    payment_id: int | None
    pdf_url: str | None
    created_at: datetime
