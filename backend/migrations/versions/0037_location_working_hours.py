"""structured location working hours

Revision ID: 0037_location_working_hours
Revises: 0036_loyalty_rewards
Create Date: 2026-05-12
"""
from __future__ import annotations

import re

from alembic import op
import sqlalchemy as sa


revision = "0037_location_working_hours"
down_revision = "0036_loyalty_rewards"
branch_labels = None
depends_on = None


DAYS = ("sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday")
DAY_ALIASES = {
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


def upgrade() -> None:
    op.add_column(
        "locations",
        sa.Column("public_working_hours_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "locations",
        sa.Column("public_working_hours", sa.JSON(), nullable=False, server_default="[]"),
    )

    conn = op.get_bind()
    locations = sa.table(
        "locations",
        sa.column("id", sa.Integer()),
        sa.column("public_hours_weekdays", sa.String()),
        sa.column("public_hours_weekends", sa.String()),
        sa.column("public_working_hours_enabled", sa.Boolean()),
        sa.column("public_working_hours", sa.JSON()),
    )

    rows = conn.execute(
        sa.select(
            locations.c.id,
            locations.c.public_hours_weekdays,
            locations.c.public_hours_weekends,
        )
    ).fetchall()
    for row in rows:
        enabled, hours = _parse_legacy_hours(row.public_hours_weekdays, row.public_hours_weekends)
        if not enabled:
            continue
        conn.execute(
            locations.update()
            .where(locations.c.id == row.id)
            .values(
                public_working_hours_enabled=True,
                public_working_hours=hours,
            )
        )


def downgrade() -> None:
    op.drop_column("locations", "public_working_hours")
    op.drop_column("locations", "public_working_hours_enabled")


def _parse_legacy_hours(weekdays: str | None, weekends: str | None) -> tuple[bool, list[dict[str, object]]]:
    rows = [
        {"day": day, "enabled": False, "start_time": None, "end_time": None}
        for day in DAYS
    ]
    by_day = {row["day"]: row for row in rows}
    for value in (weekdays, weekends):
        parsed = _parse_legacy_line(value)
        if not parsed:
            continue
        days, start_time, end_time = parsed
        for day in days:
            by_day[day]["enabled"] = True
            by_day[day]["start_time"] = start_time
            by_day[day]["end_time"] = end_time
    enabled = any(row["enabled"] for row in rows)
    return enabled, rows if enabled else []


def _parse_legacy_line(value: str | None) -> tuple[list[str], str, str] | None:
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


def _parse_legacy_days(value: str) -> list[str]:
    names = [part.strip().casefold() for part in re.split(r"\s*(?:-|–|—|to|,|&|and)\s*", value) if part.strip()]
    days = [DAY_ALIASES[name] for name in names if name in DAY_ALIASES]
    if len(days) == 2:
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
