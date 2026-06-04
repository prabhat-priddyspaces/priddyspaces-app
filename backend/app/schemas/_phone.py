import re
from typing import Annotated

from pydantic import AfterValidator


def normalize_phone(value: str | None) -> str | None:
    """Strip non-digit characters and cap at 10 digits.

    Returns None for empty/blank input. Raises ValueError when more than
    10 digits are provided so API callers cannot bypass the UI limit.
    """
    if value is None:
        return None
    digits = re.sub(r"\D", "", value)
    if not digits:
        return None
    if len(digits) > 10:
        raise ValueError("phone must be at most 10 digits")
    return digits


PhoneStr = Annotated[str, AfterValidator(normalize_phone)]
