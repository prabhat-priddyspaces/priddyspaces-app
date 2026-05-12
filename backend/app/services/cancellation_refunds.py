from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.cancellation_policy import CancellationPolicy
from app.models.cancellation_policy_tier import CancellationPolicyTier
from app.models.location import Location
from app.models.space import Space


def policy_for_space(db: Session, location: Location, space: Space) -> CancellationPolicy | None:
    return (
        db.query(CancellationPolicy)
        .filter(
            CancellationPolicy.tenant_id == location.organization_id,
            CancellationPolicy.space_type == space.space_type,
        )
        .first()
    )


def policy_snapshot(db: Session, policy: CancellationPolicy | None) -> dict:
    if not policy:
        return {"tiers": [{"min_hours_before_start": 0, "refund_percent": 100}]}
    tiers = (
        db.query(CancellationPolicyTier)
        .filter(CancellationPolicyTier.cancellation_policy_id == policy.id)
        .order_by(CancellationPolicyTier.min_hours_before_start.desc())
        .all()
    )
    if not tiers:
        return {
            "policy_public_id": policy.public_id,
            "tiers": [
                {
                    "min_hours_before_start": policy.cancel_window_hours,
                    "refund_percent": policy.refund_percent,
                }
            ],
        }
    return {
        "policy_public_id": policy.public_id,
        "tiers": [
            {
                "min_hours_before_start": tier.min_hours_before_start,
                "refund_percent": tier.refund_percent,
            }
            for tier in tiers
        ],
    }


def refund_percent_from_snapshot(
    snapshot: dict | None,
    *,
    start_datetime: datetime,
    now: datetime | None = None,
) -> int:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    start = start_datetime if start_datetime.tzinfo else start_datetime.replace(tzinfo=timezone.utc)
    hours_before = max(0.0, (start - now).total_seconds() / 3600.0)
    tiers = sorted(
        (snapshot or {}).get("tiers") or [],
        key=lambda t: int(t.get("min_hours_before_start", 0)),
        reverse=True,
    )
    for tier in tiers:
        if hours_before >= int(tier.get("min_hours_before_start", 0)):
            return max(0, min(100, int(tier.get("refund_percent", 0))))
    return 0
