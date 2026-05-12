from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


WorkingDay = Literal[
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
]

DAYS: tuple[WorkingDay, ...] = (
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
)
DEFAULT_START_TIME = "09:00"
DEFAULT_END_TIME = "17:00"

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
_DAY_ALIASES: dict[str, WorkingDay] = {
    "sun": "sunday",
    "sunday": "sunday",
    "mon": "monday",
    "monday": "monday",
    "tue": "tuesday",
    "tues": "tuesday",
    "tuesday": "tuesday",
    "wed": "wednesday",
    "wednesday": "wednesday",
    "thu": "thursday",
    "thur": "thursday",
    "thurs": "thursday",
    "thursday": "thursday",
    "fri": "friday",
    "friday": "friday",
    "sat": "saturday",
    "saturday": "saturday",
}


class PublicWorkingHour(BaseModel):
    day: WorkingDay
    enabled: bool = False
    start_time: str | None = None
    end_time: str | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def empty_time_to_none(cls, value: Any) -> Any:
        if value == "":
            return None
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not _TIME_RE.match(value):
            raise ValueError("Working hours times must use HH:MM format")
        return value

    @model_validator(mode="after")
    def validate_enabled_range(self) -> "PublicWorkingHour":
        if not self.enabled:
            return self
        if not self.start_time or not self.end_time:
            raise ValueError("Enabled working days require start_time and end_time")
        if _minutes(self.start_time) >= _minutes(self.end_time):
            raise ValueError("Working hours start_time must be before end_time")
        return self


def default_public_working_hours() -> list[dict[str, object]]:
    return [
        {
            "day": day,
            "enabled": day in {"monday", "tuesday", "wednesday", "thursday", "friday"},
            "start_time": DEFAULT_START_TIME if day not in {"sunday", "saturday"} else None,
            "end_time": DEFAULT_END_TIME if day not in {"sunday", "saturday"} else None,
        }
        for day in DAYS
    ]


def normalize_public_working_hours(value: Any) -> list[dict[str, object]]:
    if value is None:
        value = []
    if not isinstance(value, list):
        raise ValueError("public_working_hours must be a list")

    seen: set[WorkingDay] = set()
    rows_by_day: dict[WorkingDay, dict[str, object]] = {}
    for raw in value:
        row = PublicWorkingHour.model_validate(raw).model_dump()
        day = row["day"]
        if day in seen:
            raise ValueError(f"Duplicate working hours day: {day}")
        seen.add(day)
        rows_by_day[day] = row

    return [
        rows_by_day.get(
            day,
            {"day": day, "enabled": False, "start_time": None, "end_time": None},
        )
        for day in DAYS
    ]


def validate_public_working_hours(enabled: bool, value: Any) -> list[dict[str, object]]:
    hours = normalize_public_working_hours(value)
    if enabled and not any(row["enabled"] for row in hours):
        raise ValueError("At least one working day must be enabled")
    return hours


def effective_public_working_hours(
    *,
    enabled: bool | None,
    hours: Any,
    legacy_weekdays: str | None = None,
    legacy_weekends: str | None = None,
) -> tuple[bool, list[dict[str, object]]]:
    if isinstance(hours, list) and hours:
        normalized = normalize_public_working_hours(hours)
        enabled_value = bool(enabled)
        if enabled_value and not any(row["enabled"] for row in normalized):
            enabled_value = False
        return enabled_value, normalized

    return parse_legacy_public_hours(legacy_weekdays, legacy_weekends)


def parse_legacy_public_hours(
    weekdays: str | None,
    weekends: str | None,
) -> tuple[bool, list[dict[str, object]]]:
    rows = [
        {"day": day, "enabled": False, "start_time": None, "end_time": None}
        for day in DAYS
    ]
    by_day = {str(row["day"]): row for row in rows}

    for value in (weekdays, weekends):
        parsed = _parse_legacy_line(value)
        if not parsed:
            continue
        days, start_time, end_time = parsed
        for day in days:
            by_day[day]["enabled"] = True
            by_day[day]["start_time"] = start_time
            by_day[day]["end_time"] = end_time

    enabled = any(bool(row["enabled"]) for row in rows)
    return enabled, rows if enabled else []


def _parse_legacy_line(value: str | None) -> tuple[list[WorkingDay], str, str] | None:
    if not value:
        return None
    cleaned = value.strip()
    if not cleaned or "closed" in cleaned.casefold():
        return None

    parts = re.split(r"\s*[•|]\s*", cleaned, maxsplit=1)
    if len(parts) != 2:
        return None

    days = _parse_legacy_days(parts[0])
    times = re.split(r"\s+(?:to|-|–|—)\s+", parts[1], maxsplit=1, flags=re.IGNORECASE)
    if not days or len(times) != 2:
        return None

    start_time = _parse_time_label(times[0])
    end_time = _parse_time_label(times[1])
    if not start_time or not end_time or _minutes(start_time) >= _minutes(end_time):
        return None
    return days, start_time, end_time


def _parse_legacy_days(value: str) -> list[WorkingDay]:
    names = [part.strip().casefold() for part in re.split(r"\s*(?:-|–|—|to|,|&|and)\s*", value) if part.strip()]
    days = [_DAY_ALIASES[name] for name in names if name in _DAY_ALIASES]
    if len(days) == 2 and days[0] in DAYS and days[1] in DAYS:
        start = DAYS.index(days[0])
        end = DAYS.index(days[1])
        if start <= end:
            return list(DAYS[start : end + 1])
    return list(dict.fromkeys(days))


def _parse_time_label(value: str) -> str | None:
    match = re.match(r"^\s*(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\.?\s*$", value, re.IGNORECASE)
    if not match:
        match_24h = re.match(r"^\s*([01]?\d|2[0-3]):([0-5]\d)\s*$", value)
        if not match_24h:
            return None
        return f"{int(match_24h.group(1)):02d}:{match_24h.group(2)}"

    hour = int(match.group(1))
    minute = int(match.group(2) or "0")
    meridiem = match.group(3).lower()
    if hour < 1 or hour > 12:
        return None
    if meridiem == "p" and hour != 12:
        hour += 12
    if meridiem == "a" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute:02d}"


def _minutes(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 60 + int(minutes)
