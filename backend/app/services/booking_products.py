from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.enums import BookingMode, SpaceType
from app.models.membership_plan import MembershipPlan
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.subscription import Subscription
from app.services.booking_modes import VALID_BOOKING_MODES_BY_SPACE_TYPE
from app.services.money import CENT, money_to_cents, to_money_decimal


DIRECT_BOOKING_MODES = {BookingMode.HOURLY.value, BookingMode.DAY_PASS.value}
PLAN_BOOKING_MODES = {
    BookingMode.MONTHLY_MEMBERSHIP.value,
    BookingMode.VIRTUAL_MEMBERSHIP.value,
    BookingMode.PRIVATE_OFFICE_LEASE.value,
    BookingMode.SUITE_LEASE.value,
}
EXCLUSIVE_LEASE_MODES = {
    BookingMode.PRIVATE_OFFICE_LEASE.value,
    BookingMode.SUITE_LEASE.value,
}


@dataclass(frozen=True)
class BookingProduct:
    product_type: str
    booking_mode: str
    label: str
    price: Decimal | None = None
    price_cents: int | None = None
    membership_plan_public_id: str | None = None
    billing_cycle: str | None = None
    commitment_months: int | None = None
    seats_per_plan: int | None = None
    space_capacity: int | None = None
    available_seats: int | None = None
    included_meeting_room_hours_per_month: int | None = None
    overage_hourly_rate_cents: int | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "product_type": self.product_type,
            "booking_mode": self.booking_mode,
            "label": self.label,
            "price": self.price,
            "price_cents": self.price_cents,
            "membership_plan_public_id": self.membership_plan_public_id,
            "billing_cycle": self.billing_cycle,
            "commitment_months": self.commitment_months,
            "seats_per_plan": self.seats_per_plan,
            "space_capacity": self.space_capacity,
            "available_seats": self.available_seats,
            "included_meeting_room_hours_per_month": self.included_meeting_room_hours_per_month,
            "overage_hourly_rate_cents": self.overage_hourly_rate_cents,
        }


def _space_type_value(space: Space) -> str:
    raw = getattr(space.space_type, "value", space.space_type)
    return str(raw)


def _space_type(space: Space) -> SpaceType:
    raw = getattr(space.space_type, "value", space.space_type)
    return SpaceType(raw)


def _enabled_modes(db: Session, space: Space) -> set[str]:
    rows = (
        db.query(SpaceBookingMode)
        .filter(SpaceBookingMode.space_id == space.id)
        .all()
    )
    defaults = {mode.value for mode in VALID_BOOKING_MODES_BY_SPACE_TYPE.get(_space_type(space), set())}
    if not rows:
        return defaults
    configured = {row.booking_mode for row in rows}
    enabled = {row.booking_mode for row in rows if row.is_enabled}
    for direct_mode in DIRECT_BOOKING_MODES:
        if direct_mode in defaults and direct_mode not in configured:
            enabled.add(direct_mode)
    return enabled


def _active_plans(db: Session, space: Space, booking_modes: set[str]) -> list[MembershipPlan]:
    if not booking_modes:
        return []
    return (
        db.query(MembershipPlan)
        .filter(
            MembershipPlan.space_id == space.id,
            MembershipPlan.booking_mode.in_(booking_modes),
            MembershipPlan.is_active.is_(True),
        )
        .order_by(MembershipPlan.sort_order.asc(), MembershipPlan.price_cents.asc())
        .all()
    )


def _has_active_exclusive_lease(db: Session, space: Space) -> bool:
    today = date.today()
    return (
        db.query(Subscription.id)
        .filter(
            Subscription.space_id == space.id,
            Subscription.status.in_(["pending_payment", "active", "past_due"]),
            Subscription.start_date <= today,
            or_(Subscription.end_date.is_(None), Subscription.end_date >= today),
            or_(
                Subscription.booking_mode.is_(None),
                Subscription.booking_mode.in_(EXCLUSIVE_LEASE_MODES),
            ),
        )
        .first()
        is not None
    )


def _plan_available_seats(db: Session, space: Space, plan: MembershipPlan) -> int | None:
    if plan.booking_mode not in EXCLUSIVE_LEASE_MODES:
        return None
    return 0 if _has_active_exclusive_lease(db, space) else max(1, space.capacity or 1)


def booking_products_for_space(db: Session, space: Space) -> list[dict[str, object]]:
    """Return member-facing products for a space without removing legacy fields."""
    space_type = _space_type_value(space)
    enabled = _enabled_modes(db, space)
    products: list[BookingProduct] = []

    if space_type == SpaceType.CONFERENCE_ROOM.value and BookingMode.HOURLY.value in enabled:
        if space.price_hourly is not None:
            price = to_money_decimal(space.price_hourly).quantize(CENT)
            products.append(
                BookingProduct(
                    product_type="hourly",
                    booking_mode=BookingMode.HOURLY.value,
                    label="Hourly reservation",
                    price=price,
                    price_cents=money_to_cents(price),
                    space_capacity=space.capacity,
                )
            )

    if space_type == SpaceType.SHARED_DESK.value and BookingMode.DAY_PASS.value in enabled:
        if space.price_daily is not None:
            price = to_money_decimal(space.price_daily).quantize(CENT)
            products.append(
                BookingProduct(
                    product_type="day_pass",
                    booking_mode=BookingMode.DAY_PASS.value,
                    label="Day Pass",
                    price=price,
                    price_cents=money_to_cents(price),
                    seats_per_plan=1,
                    space_capacity=space.capacity,
                    available_seats=space.capacity,
                )
            )

    plan_modes = enabled & PLAN_BOOKING_MODES
    for plan in _active_plans(db, space, plan_modes):
        products.append(
            BookingProduct(
                product_type=plan.booking_mode,
                booking_mode=plan.booking_mode,
                label=plan.name,
                price=to_money_decimal(Decimal(plan.price_cents) / Decimal(100)).quantize(CENT),
                price_cents=plan.price_cents,
                membership_plan_public_id=plan.public_id,
                billing_cycle=plan.billing_cycle,
                commitment_months=plan.commitment_months,
                seats_per_plan=plan.seats_per_plan,
                space_capacity=space.capacity,
                available_seats=_plan_available_seats(db, space, plan),
                included_meeting_room_hours_per_month=plan.included_meeting_room_hours_per_month,
                overage_hourly_rate_cents=plan.overage_hourly_rate_cents,
            )
        )

    return [product.as_dict() for product in products]


def valid_plan_mode_for_space(space: Space, booking_mode: str) -> bool:
    return booking_mode in {mode.value for mode in VALID_BOOKING_MODES_BY_SPACE_TYPE.get(_space_type(space), set())}


def validate_direct_booking_product(
    space: Space,
    *,
    booking_mode: str | None,
    full_day: bool,
    seats_requested: int = 1,
) -> None:
    """Validate one-time booking requests against the product model."""
    space_type = _space_type_value(space)
    normalized_mode = booking_mode or (BookingMode.DAY_PASS.value if full_day else BookingMode.HOURLY.value)
    seats = max(1, seats_requested or 1)

    if space_type == SpaceType.CONFERENCE_ROOM.value:
        if full_day or normalized_mode != BookingMode.HOURLY.value:
            raise HTTPException(status_code=400, detail="Conference rooms can only be booked hourly")
        if space.price_hourly is None:
            raise HTTPException(status_code=400, detail="Hourly price is required for conference room bookings")
        return

    if space_type == SpaceType.SHARED_DESK.value:
        if not full_day and normalized_mode != BookingMode.DAY_PASS.value:
            raise HTTPException(status_code=400, detail="Shared desks can only be booked as day passes")
        if space.price_daily is None:
            raise HTTPException(status_code=400, detail="Day-pass price is required for shared desk bookings")
        if seats > max(1, space.capacity or 1):
            raise HTTPException(status_code=400, detail="Requested seats exceed shared desk capacity")
        return

    if space_type in {SpaceType.PRIVATE_OFFICE.value, SpaceType.SUITE.value}:
        raise HTTPException(status_code=400, detail="Private offices and suites must be requested through lease terms")

    if space_type == SpaceType.VIRTUAL_OFFICE.value:
        raise HTTPException(status_code=400, detail="Virtual offices must be purchased through virtual membership plans")

    raise HTTPException(status_code=400, detail="Unsupported booking product for this space")
