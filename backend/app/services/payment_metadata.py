from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


GENERIC_PAYMENT_FAILURE_REASON = (
    "The payment processor declined the charge. Update the card or contact the card issuer for details."
)


def normalize_card_last4(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if re.fullmatch(r"\d{4}", text) else None


def last4_from_card_token(value: Any) -> str | None:
    if value is None:
        return None
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) < 4:
        return None
    return digits[-4:]


def _coerce_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def _normalize_year(value: int | None) -> int | None:
    if value is None:
        return None
    if 0 <= value < 100:
        return 2000 + value
    return value


def normalize_expiry(
    exp_month: Any = None,
    exp_year: Any = None,
    *,
    expiration: Any = None,
) -> tuple[int | None, int | None]:
    month = _coerce_int(exp_month)
    year = _normalize_year(_coerce_int(exp_year))

    if (month is None or year is None) and expiration:
        digits = "".join(ch for ch in str(expiration) if ch.isdigit())
        if len(digits) == 4:
            first = int(digits[:2])
            second = int(digits[2:])
            if 1 <= first <= 12:
                month = month or first
                year = year or _normalize_year(second)
            elif 1 <= second <= 12:
                month = month or second
                year = year or _normalize_year(first)
        elif len(digits) == 6:
            first_two = int(digits[:2])
            if 1 <= first_two <= 12:
                month = month or first_two
                year = year or int(digits[2:])
            else:
                trailing_two = int(digits[-2:])
                if 1 <= trailing_two <= 12:
                    month = month or trailing_two
                    year = year or int(digits[:4])

    if month is None or year is None:
        return None, None
    if not 1 <= month <= 12:
        return None, None
    now = datetime.now(timezone.utc)
    if year < now.year or year > now.year + 30:
        return None, None
    if year == now.year and month < now.month:
        return None, None
    return month, year


def payment_method_has_complete_metadata(
    *,
    provider: str | None,
    provider_customer_id: Any = None,
    provider_payment_method_id: Any = None,
    card_token: Any = None,
    last4: Any = None,
    exp_month: Any = None,
    exp_year: Any = None,
) -> bool:
    normalized_last4 = normalize_card_last4(last4)
    normalized_month, normalized_year = normalize_expiry(exp_month, exp_year)
    if not normalized_last4 or not normalized_month or not normalized_year:
        return False
    if provider == "stripe":
        return bool(provider_customer_id and provider_payment_method_id)
    if provider == "cardpointe":
        return bool(card_token)
    return False


def normalize_payment_failure_reason(reason: Any, *, default: str = GENERIC_PAYMENT_FAILURE_REASON) -> str:
    cleaned = str(reason or "").replace("\n", " ").replace("\r", " ").strip()
    normalized = cleaned.lower()
    if not cleaned or normalized in {"0", "none", "null", "false", "failed", "payment failed"}:
        return default
    if normalized in {"declined", "card declined", "do not honor"}:
        return "Card declined. Update the card or contact the card issuer for details."
    return cleaned[:512]


def normalize_cardpointe_tokenizer_url(url: str | None) -> str | None:
    if not url:
        return None
    split = urlsplit(url.strip())
    query = dict(parse_qsl(split.query, keep_blank_values=True))
    query.setdefault("useexpiry", "true")
    query.setdefault("enhancedresponse", "true")
    query.setdefault("invalidcreditcardevent", "true")
    query.setdefault("invalidexpiryevent", "true")
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(query), split.fragment))
