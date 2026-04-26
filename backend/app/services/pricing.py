from datetime import datetime


def estimate_booking_amount(
    start_dt: datetime,
    end_dt: datetime,
    price_daily: int | None,
    price_monthly: int | None,
    rate_type: str | None = None,
    rate_amount: int | None = None,
    tax_rate_percent: float | None = None
) -> int | None:
    duration = end_dt - start_dt
    hours = max(1, int((duration.total_seconds() + 3600 - 1) // 3600))
    days = max(1, int((duration.total_seconds() + 86400 - 1) // 86400))

    base = None
    if rate_type and rate_amount:
        if rate_type == "hourly":
            base = rate_amount * hours
        elif rate_type == "daily":
            base = rate_amount * days
    elif price_daily:
        base = price_daily * days
    elif price_monthly:
        daily_rate = max(1, int(price_monthly / 30))
        base = daily_rate * days

    if base is None:
        return None

    if tax_rate_percent:
        base = int(round(base * (1 + (tax_rate_percent / 100))))
    return base
