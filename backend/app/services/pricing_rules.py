"""Single source of truth for space pricing-rule lookups.

These helpers were previously copy-pasted across ``booking_requests``,
``payments``, ``booking_payments``, ``owner_created_bookings``, and ``loyalty``.
Consolidating them removes the risk that the guest-booking and
owner-created-booking price paths drift apart (a customer-facing financial bug).

This module is intentionally separate from ``app.services.pricing`` (pure
pricing math, no DB) because these helpers need a SQLAlchemy session.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.pricing_rule import PricingRule
from app.services.pricing import VolumeDiscount

_GRANULARITY_MINUTES = {"30m": 30, "60m": 60, "120m": 120, "daily": 24 * 60}


def granularity_to_minutes(value: Any) -> int:
    """Map a location booking-granularity enum/string to minutes (default 60)."""
    raw = getattr(value, "value", value)
    return _GRANULARITY_MINUTES.get(raw, 60)


def active_volume_discounts(db: Session, space_id: int) -> list[VolumeDiscount]:
    """Active volume-discount tiers for a space ([] when none or model absent)."""
    try:
        from app.models.space_volume_discount import SpaceVolumeDiscount
    except ImportError:
        return []
    rows = (
        db.query(SpaceVolumeDiscount)
        .filter(
            SpaceVolumeDiscount.space_id == space_id,
            SpaceVolumeDiscount.is_active.is_(True),
        )
        .all()
    )
    return [
        VolumeDiscount(min_hours=float(r.min_hours), discount_percent=int(r.discount_percent))
        for r in rows
    ]


def get_active_pricing_rule(db: Session, space_id: int) -> PricingRule | None:
    """Most recently created pricing rule active for ``space_id`` right now."""
    now = datetime.now(timezone.utc)
    return (
        db.query(PricingRule)
        .filter(
            PricingRule.space_id == space_id,
            (PricingRule.active_from.is_(None) | (PricingRule.active_from <= now)),
            (PricingRule.active_to.is_(None) | (PricingRule.active_to >= now)),
        )
        .order_by(PricingRule.created_at.desc())
        .first()
    )
