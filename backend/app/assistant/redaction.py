from __future__ import annotations

import re


_PATTERNS: dict[str, re.Pattern[str]] = {
    "credit_card": re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "phone": re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)"),
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
}


def redact_pii(text: str, *, current_user_email: str | None = None) -> tuple[str, dict[str, int]]:
    """Redact sensitive values before persistence and before provider calls.

    The user's own account email may be needed for support escalation context,
    but arbitrary third-party emails are still replaced.
    """
    redacted = text
    counts: dict[str, int] = {}

    for key, pattern in _PATTERNS.items():
        matches = list(pattern.finditer(redacted))
        if key == "email" and current_user_email:
            normalized = current_user_email.lower()
            matches = [m for m in matches if m.group(0).lower() != normalized]
        if not matches:
            counts[key] = 0
            continue
        counts[key] = len(matches)
        redacted = pattern.sub(f"[REDACTED:{key}]", redacted)

    return redacted, counts
