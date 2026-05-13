from decimal import Decimal, ROUND_HALF_UP
from typing import Any


CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def to_money_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def money_to_cents(value: Any, *, multiplier: Decimal | int | float | str = 1) -> int:
    dollars = to_money_decimal(value) * to_money_decimal(multiplier)
    rounded = dollars.quantize(CENT, rounding=ROUND_HALF_UP)
    return int(rounded * HUNDRED)


def cents_to_money(cents: int) -> Decimal:
    return (Decimal(cents) / HUNDRED).quantize(CENT, rounding=ROUND_HALF_UP)
