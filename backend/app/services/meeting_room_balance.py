"""Helpers for the meeting-room-hour ledger.

Balance for a Subscription in the period covering `as_of` date is the SUM of
hours_delta_minutes over rows whose [billing_period_start, billing_period_end)
covers `as_of`. GRANT entries are positive, USAGE entries are negative.

All ledger writes go through this module so the caller doesn't need to know the
period boundary computation.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import LedgerEntryType
from app.models.meeting_room_hour_ledger import MeetingRoomHourLedger
from app.models.subscription import Subscription


def add_months(d: date, months: int) -> date:
    """Add `months` months to `d`, clamping to the last day if needed."""
    month_idx = d.month - 1 + months
    year = d.year + month_idx // 12
    new_month = month_idx % 12 + 1
    # Clamp day for short months.
    day = d.day
    while True:
        try:
            return date(year, new_month, day)
        except ValueError:
            day -= 1


def current_period_bounds(subscription: Subscription, *, as_of: date) -> tuple[date, date]:
    """Return [period_start, period_end) covering `as_of` for a subscription.

    Periods are anchored to commitment_start_date (or start_date) and roll forward
    by 1 month. Used both for granting and for balance reads.
    """
    anchor = subscription.commitment_start_date or subscription.start_date
    if anchor is None:
        anchor = as_of
    period_start = anchor
    while True:
        period_end = add_months(period_start, 1)
        if period_start <= as_of < period_end:
            return period_start, period_end
        if period_end > as_of:
            # `as_of` is before the anchor — return the anchor's first period anyway.
            return period_start, period_end
        period_start = period_end


@dataclass
class BalanceSummary:
    period_start: date
    period_end: date
    granted_minutes: int
    used_minutes: int
    remaining_minutes: int


def balance_for_period(
    db: Session, subscription: Subscription, *, as_of: date
) -> BalanceSummary:
    period_start, period_end = current_period_bounds(subscription, as_of=as_of)

    rows = (
        db.query(
            MeetingRoomHourLedger.entry_type,
            func.coalesce(func.sum(MeetingRoomHourLedger.hours_delta_minutes), 0).label("total"),
        )
        .filter(
            MeetingRoomHourLedger.subscription_id == subscription.id,
            MeetingRoomHourLedger.billing_period_start == period_start,
        )
        .group_by(MeetingRoomHourLedger.entry_type)
        .all()
    )

    granted = 0
    used = 0
    for entry_type, total in rows:
        delta = int(total or 0)
        if entry_type == LedgerEntryType.GRANT.value:
            granted += delta
        elif entry_type == LedgerEntryType.USAGE.value:
            used += -delta  # USAGE entries are stored negative
        elif entry_type == LedgerEntryType.ADJUSTMENT.value:
            # Adjustments may be positive (add) or negative (deduct).
            granted += max(delta, 0)
            used += max(-delta, 0)
        # EXPIRY rows zero out the period; we treat them as a deduction so that
        # subsequent reads return zero remaining.
        elif entry_type == LedgerEntryType.EXPIRY.value:
            used += -delta

    remaining = max(0, granted - used)
    return BalanceSummary(
        period_start=period_start,
        period_end=period_end,
        granted_minutes=granted,
        used_minutes=used,
        remaining_minutes=remaining,
    )


def write_grant(
    db: Session,
    subscription: Subscription,
    *,
    period_start: date,
    period_end: date,
    minutes: int,
    description: str | None = None,
) -> MeetingRoomHourLedger:
    """Insert a GRANT entry. Caller is responsible for picking period bounds."""
    if minutes <= 0:
        raise ValueError("GRANT minutes must be positive")
    entry = MeetingRoomHourLedger(
        tenant_id=subscription.tenant_id,
        subscription_id=subscription.id,
        billing_period_start=period_start,
        billing_period_end=period_end,
        entry_type=LedgerEntryType.GRANT.value,
        hours_delta_minutes=minutes,
        description=description,
    )
    db.add(entry)
    db.flush()
    return entry


def write_usage(
    db: Session,
    subscription: Subscription,
    *,
    minutes: int,
    booking_id: int | None,
    as_of: date,
    description: str | None = None,
) -> MeetingRoomHourLedger:
    """Insert a USAGE entry (stored as negative minutes) for the current period."""
    if minutes <= 0:
        raise ValueError("USAGE minutes must be positive")
    period_start, period_end = current_period_bounds(subscription, as_of=as_of)
    entry = MeetingRoomHourLedger(
        tenant_id=subscription.tenant_id,
        subscription_id=subscription.id,
        booking_id=booking_id,
        billing_period_start=period_start,
        billing_period_end=period_end,
        entry_type=LedgerEntryType.USAGE.value,
        hours_delta_minutes=-minutes,
        description=description,
    )
    db.add(entry)
    db.flush()
    return entry


def find_active_membership_for_meeting_room(
    db: Session, *, user_id: int, tenant_id: int, space_id: int | None = None
) -> Subscription | None:
    """Pick a Subscription that grants meeting-room hours.

    Prefer one whose `space_id` matches; otherwise fall back to any tenant-wide
    membership held by the user. Status must be ACTIVE.
    """
    query = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == user_id,
            Subscription.tenant_id == tenant_id,
            Subscription.status == "active",
            Subscription.included_meeting_room_hours_per_month > 0,
        )
    )

    if space_id is not None:
        scoped = query.filter(Subscription.space_id == space_id).first()
        if scoped:
            return scoped

    return query.first()


__all__ = [
    "BalanceSummary",
    "add_months",
    "balance_for_period",
    "current_period_bounds",
    "find_active_membership_for_meeting_room",
    "write_grant",
    "write_usage",
]


# tiny helper for callers that don't want to import timedelta themselves
def days(n: int) -> timedelta:
    return timedelta(days=n)
