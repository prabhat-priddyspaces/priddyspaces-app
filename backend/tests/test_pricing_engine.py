from datetime import datetime, timedelta, timezone

from app.services.pricing import (
    EstimateResult,
    VolumeDiscount,
    estimate_booking_amount,
    estimate_booking_price,
)


def _window(hours: float) -> tuple[datetime, datetime]:
    start = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=hours)
    return start, end


def test_one_hour_with_hourly_only_returns_hourly_total():
    start, end = _window(1)
    result = estimate_booking_price(start, end, price_hourly=30)
    assert isinstance(result, EstimateResult)
    assert result.base_cents == 3000
    assert result.units == 1.0
    assert result.rate_basis == "hourly"
    assert result.discount_cents == 0
    assert result.total_cents == 3000


def test_hourly_total_caps_to_daily_when_exceeded():
    # 10 hours x $30/hr = $300, but day rate is $200. Should be capped to $200.
    start, end = _window(10)
    result = estimate_booking_price(
        start, end, price_hourly=30, price_daily=200,
    )
    assert result.base_cents == 20000
    assert result.rate_basis == "capped_to_daily"
    assert result.units == 1.0
    assert result.total_cents == 20000


def test_full_day_uses_daily_rate():
    start, end = _window(2)
    result = estimate_booking_price(
        start, end,
        price_hourly=30, price_daily=200,
        full_day=True,
    )
    assert result.base_cents == 20000
    assert result.rate_basis == "daily"


def test_pricing_rule_override_wins_over_space_hourly():
    start, end = _window(2)
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        rate_type="hourly", rate_amount=40,  # PricingRule says $40/hr
    )
    assert result.base_cents == 8000
    assert result.rate_basis == "rule_hourly"


def test_granularity_30_minute_charges_partial_hours():
    # 90-minute booking on a 30-min granularity space → 1.5 x hourly.
    start = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    end = start + timedelta(minutes=90)
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        granularity_minutes=30,
    )
    assert result.base_cents == 4500
    assert result.units == 1.5


def test_decimal_hourly_price_rounds_to_cents():
    start = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    end = start + timedelta(minutes=90)
    result = estimate_booking_price(
        start, end,
        price_hourly="19.99",
        granularity_minutes=30,
    )
    assert result.base_cents == 2999
    assert result.units == 1.5


def test_granularity_60_minute_rounds_up_to_full_hour():
    start = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    end = start + timedelta(minutes=90)  # 1.5 hours
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        granularity_minutes=60,
    )
    # 60-min granularity rounds 90 min up to 2 hours.
    assert result.base_cents == 6000
    assert result.units == 2.0


def test_volume_discount_applies_to_hourly_path():
    # 4 hours with $30/hr = $120 base, 10% discount = $108.
    start, end = _window(4)
    discounts = [VolumeDiscount(min_hours=4.0, discount_percent=10)]
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        volume_discounts=discounts,
    )
    assert result.base_cents == 12000
    assert result.discount_percent == 10
    assert result.discount_cents == -1200
    assert result.total_cents == 10800


def test_volume_discount_picks_best_eligible_tier():
    # 8 hours qualifies for both tiers; engine picks the higher-percent one.
    start, end = _window(8)
    discounts = [
        VolumeDiscount(min_hours=4.0, discount_percent=10),
        VolumeDiscount(min_hours=8.0, discount_percent=20),
    ]
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        volume_discounts=discounts,
    )
    assert result.discount_percent == 20
    assert result.base_cents == 24000
    assert result.discount_cents == -4800
    assert result.total_cents == 19200


def test_volume_discount_skipped_when_capped_to_daily():
    # Auto-cap kicks in; volume discount should NOT compound on top of the day rate.
    start, end = _window(10)
    discounts = [VolumeDiscount(min_hours=4.0, discount_percent=10)]
    result = estimate_booking_price(
        start, end,
        price_hourly=30, price_daily=200,
        volume_discounts=discounts,
    )
    assert result.rate_basis == "capped_to_daily"
    assert result.discount_percent == 0


def test_volume_discount_does_not_apply_to_full_day():
    # Discount is hourly-path only.
    start, end = _window(2)
    discounts = [VolumeDiscount(min_hours=1.0, discount_percent=50)]
    result = estimate_booking_price(
        start, end,
        price_hourly=30, price_daily=200,
        full_day=True,
        volume_discounts=discounts,
    )
    assert result.rate_basis == "daily"
    assert result.discount_percent == 0
    assert result.total_cents == 20000


def test_explicit_hourly_without_hourly_price_refuses():
    # The original bug: hourly request against a daily-only space. Now refuses.
    start, end = _window(1)
    result = estimate_booking_price(
        start, end,
        price_daily=200,
        booking_mode="hourly",
    )
    assert result is None


def test_legacy_call_with_only_daily_falls_through():
    # No booking_mode signal → preserves legacy behaviour for daily-only spaces.
    start, end = _window(1)
    result = estimate_booking_price(start, end, price_daily=200)
    assert result.base_cents == 20000
    assert result.rate_basis == "daily"


def test_tax_applied_after_discount():
    start, end = _window(4)
    discounts = [VolumeDiscount(min_hours=4.0, discount_percent=10)]
    result = estimate_booking_price(
        start, end,
        price_hourly=30,
        volume_discounts=discounts,
        tax_rate_percent=10,
    )
    # base 12000, discount -1200, after-discount 10800, tax 10% = 1080, total 11880.
    assert result.tax_cents == 1080
    assert result.total_cents == 11880


def test_backwards_compat_shim_returns_int():
    start, end = _window(1)
    total = estimate_booking_amount(start, end, None, None, price_hourly=30)
    assert total == 3000


def test_zero_or_negative_duration_returns_none():
    start = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    assert estimate_booking_price(start, start, price_hourly=30) is None
    assert estimate_booking_price(start, start - timedelta(minutes=5), price_hourly=30) is None
