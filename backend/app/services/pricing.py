from dataclasses import dataclass
from datetime import datetime
from math import ceil
from typing import Iterable, Optional


@dataclass(frozen=True)
class VolumeDiscount:
    """A single tier of volume discount: book >= min_hours, get discount_percent off."""
    min_hours: float
    discount_percent: int


@dataclass
class EstimateResult:
    base_cents: int
    discount_percent: int
    discount_cents: int   # negative or zero
    tax_cents: int
    total_cents: int
    rate_basis: str       # 'hourly' | 'daily' | 'capped_to_daily' | 'monthly_fallback' | 'rule_hourly' | 'rule_daily'
    units: float          # hours or days, for the "$X x N" line


def _hours_with_granularity(seconds: float, granularity_minutes: int) -> float:
    """Round duration UP to the next granularity_minutes boundary, return as hours."""
    if granularity_minutes <= 0:
        granularity_minutes = 60
    granularity_seconds = granularity_minutes * 60
    blocks = max(1, ceil(seconds / granularity_seconds))
    return (blocks * granularity_seconds) / 3600.0


def _days_ceiled(seconds: float) -> int:
    return max(1, ceil(seconds / 86400))


def _pick_best_tier(tiers: Iterable[VolumeDiscount], hours: float) -> Optional[VolumeDiscount]:
    """Pick the tier with the highest discount_percent among tiers whose threshold is met.
    Tie-break by highest min_hours (the more committed tier wins)."""
    eligible = [t for t in tiers if hours >= t.min_hours and 0 < t.discount_percent < 100]
    if not eligible:
        return None
    return max(eligible, key=lambda t: (t.discount_percent, t.min_hours))


def estimate_booking_price(
    start_dt: datetime,
    end_dt: datetime,
    *,
    price_hourly: int | None = None,
    price_daily: int | None = None,
    price_monthly: int | None = None,
    rate_type: str | None = None,            # PricingRule override: 'hourly' | 'daily'
    rate_amount: int | None = None,           # PricingRule override (cents)
    booking_mode: str | None = None,          # 'hourly' | 'day_pass' (informational)
    full_day: bool = False,                   # explicit "Full day" toggle
    volume_discounts: Iterable[VolumeDiscount] | None = None,
    granularity_minutes: int = 60,
    tax_rate_percent: float | None = None,
) -> EstimateResult | None:
    """Compute the booking price as a rich breakdown.

    Selection rules (first matching wins):
      1. PricingRule override (rate_type + rate_amount) — for time-windowed promos.
      2. full_day=True OR booking_mode='day_pass' → price_daily (or hourly x open span as fallback).
      3. Hourly path: price_hourly x hours (granularity-aware), capped to price_daily if exceeded.
      4. price_monthly fallback (legacy).

    Volume discount applies only to the hourly path (rule 3) — hourly bookings reward
    longer commitments. Day-pass and monthly use their flat rates.
    """
    duration = (end_dt - start_dt).total_seconds()
    if duration <= 0:
        return None

    hours = _hours_with_granularity(duration, granularity_minutes)
    days = _days_ceiled(duration)

    base_cents: int | None = None
    units: float = 0.0
    rate_basis: str = ""
    discount_eligible = False

    # Rule 1: PricingRule override
    if rate_type and rate_amount:
        if rate_type == "hourly":
            base_cents = int(rate_amount * hours)
            units = hours
            rate_basis = "rule_hourly"
            discount_eligible = True
        elif rate_type == "daily":
            base_cents = rate_amount * days
            units = days
            rate_basis = "rule_daily"

    # Rule 2: explicit day pass / full day
    elif full_day or booking_mode == "day_pass":
        if price_daily is not None:
            base_cents = price_daily
            units = 1.0
            rate_basis = "daily"
        elif price_hourly is not None:
            # Day-pass with no daily rate set: charge the hourly span (rare config).
            day_hours = max(1.0, duration / 3600.0)
            base_cents = int(price_hourly * day_hours)
            units = day_hours
            rate_basis = "daily"

    # Rule 3: hourly path (with auto-cap to daily)
    elif price_hourly is not None:
        hourly_total = int(price_hourly * hours)
        if price_daily is not None and hourly_total > price_daily:
            base_cents = price_daily
            units = 1.0
            rate_basis = "capped_to_daily"
            # Once capped to the day rate, the customer is effectively on the day rate;
            # don't compound by also applying a volume discount.
        else:
            base_cents = hourly_total
            units = hours
            rate_basis = "hourly"
            discount_eligible = True

    # Rule 4: explicit hourly request without an hourly rate set — refuse rather than
    # silently fall back to a full day charge (this was the original bug).
    elif booking_mode == "hourly":
        return None

    # Rule 5: legacy fallback — only daily set, no explicit mode signal. Charge daily
    # per day (this preserves behaviour for daily-only spaces; meeting-room widgets
    # should always send booking_mode/full_day explicitly).
    elif price_daily is not None:
        base_cents = price_daily * days
        units = days
        rate_basis = "daily"
    elif price_monthly is not None:
        daily_rate = max(1, int(price_monthly / 30))
        base_cents = daily_rate * days
        units = days
        rate_basis = "monthly_fallback"

    if base_cents is None:
        return None

    discount_percent = 0
    discount_cents = 0
    if discount_eligible and volume_discounts:
        best = _pick_best_tier(volume_discounts, hours)
        if best:
            discount_percent = best.discount_percent
            discount_cents = -int(round(base_cents * (best.discount_percent / 100.0)))

    after_discount = base_cents + discount_cents
    tax_cents = 0
    if tax_rate_percent:
        tax_cents = int(round(after_discount * (tax_rate_percent / 100.0)))

    return EstimateResult(
        base_cents=base_cents,
        discount_percent=discount_percent,
        discount_cents=discount_cents,
        tax_cents=tax_cents,
        total_cents=after_discount + tax_cents,
        rate_basis=rate_basis,
        units=units,
    )


def estimate_booking_amount(
    start_dt: datetime,
    end_dt: datetime,
    price_daily: int | None,
    price_monthly: int | None,
    rate_type: str | None = None,
    rate_amount: int | None = None,
    tax_rate_percent: float | None = None,
    *,
    price_hourly: int | None = None,
    booking_mode: str | None = None,
    full_day: bool = False,
    volume_discounts: Iterable[VolumeDiscount] | None = None,
    granularity_minutes: int = 60,
) -> int | None:
    """Backwards-compatible shim. Returns the integer total in cents, or None.

    New code should call estimate_booking_price() directly to get the full breakdown.
    """
    result = estimate_booking_price(
        start_dt,
        end_dt,
        price_hourly=price_hourly,
        price_daily=price_daily,
        price_monthly=price_monthly,
        rate_type=rate_type,
        rate_amount=rate_amount,
        booking_mode=booking_mode,
        full_day=full_day,
        volume_discounts=volume_discounts,
        granularity_minutes=granularity_minutes,
        tax_rate_percent=tax_rate_percent,
    )
    return result.total_cents if result else None
