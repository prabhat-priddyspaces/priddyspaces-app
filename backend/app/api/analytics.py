from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.enums import (
    BookingStatus,
    PaymentStatus,
    PlatformTeamRole,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, list_org_members
from app.services.exports import rows_to_csv, rows_to_pdf
from app.services.platform_auth import require_platform_roles

router = APIRouter()

READ_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}
OWNER_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}


# ---------- helpers ----------


def _parse_date(value: str | None, default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {value}")


def _default_range(start: str | None, end: str | None, days: int = 30) -> tuple[datetime, datetime]:
    today = datetime.now(timezone.utc).date()
    end_d = _parse_date(end, today)
    start_d = _parse_date(start, end_d - timedelta(days=days - 1))
    if start_d > end_d:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_d, datetime.max.time(), tzinfo=timezone.utc)
    return start_dt, end_dt


def _owner_scope(db: Session, user: User) -> tuple[list[int], list[int], list[int]]:
    """Returns (tenant_ids, location_ids, space_ids) the user can see as owner/admin/staff."""
    members = list_org_members(db, user.id, OWNER_ROLES)
    if not members:
        return [], [], []
    tenant_ids = list({m.tenant_id for m in members})
    location_ids = list(accessible_location_ids(db, user.id, OWNER_ROLES))
    if not location_ids:
        return tenant_ids, [], []
    space_rows = db.query(Space.id).filter(Space.location_id.in_(location_ids)).all()
    space_ids = [sid for (sid,) in space_rows]
    return tenant_ids, location_ids, space_ids


def _require_owner(db: Session, token: dict) -> tuple[User, list[int], list[int], list[int]]:
    user = get_or_create_user(db, token)
    tenant_ids, location_ids, space_ids = _owner_scope(db, user)
    if not tenant_ids:
        raise HTTPException(status_code=403, detail="No owner access")
    return user, tenant_ids, location_ids, space_ids


def _overlap_hours(booking_start: datetime, booking_end: datetime, day_start: datetime, day_end: datetime) -> float:
    start = max(booking_start, day_start)
    end = min(booking_end, day_end)
    if end <= start:
        return 0.0
    return (end - start).total_seconds() / 3600.0


def _iterate_days(start_dt: datetime, end_dt: datetime) -> list[date]:
    days: list[date] = []
    cur = start_dt.date()
    end_d = end_dt.date()
    while cur <= end_d:
        days.append(cur)
        cur += timedelta(days=1)
    return days


def _booking_hours(booking: Booking) -> float:
    return max(0.0, (booking.end_datetime - booking.start_datetime).total_seconds() / 3600.0)


def _respond(format_: str, json_payload: Any, csv_bytes: bytes | None = None, pdf_bytes: bytes | None = None,
             filename: str = "export") -> Any:
    if format_ == "csv":
        if csv_bytes is None:
            raise HTTPException(status_code=400, detail="CSV not available for this endpoint")
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
        )
    if format_ == "pdf":
        if pdf_bytes is None:
            raise HTTPException(status_code=400, detail="PDF not available for this endpoint")
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
        )
    return json_payload


# ---------- Owner endpoints ----------


@router.get("/analytics/owner/overview")
def owner_overview(
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)
    prev_start = start_dt - (end_dt - start_dt)
    prev_end = start_dt

    bookings = []
    if space_ids:
        bookings = (
            db.query(Booking)
            .filter(
                Booking.space_id.in_(space_ids),
                Booking.created_at >= prev_start,
                Booking.created_at <= end_dt,
            )
            .all()
        )

    def in_range(b: Booking, s: datetime, e: datetime) -> bool:
        return b.created_at is not None and s <= b.created_at <= e

    current_bookings = [b for b in bookings if in_range(b, start_dt, end_dt)]
    prev_bookings = [b for b in bookings if in_range(b, prev_start, prev_end)]

    confirmed_current = [b for b in current_bookings if b.status == BookingStatus.CONFIRMED]
    canceled_current = [b for b in current_bookings if b.status == BookingStatus.CANCELED]

    payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id.in_(tenant_ids),
            Payment.created_at >= prev_start,
            Payment.created_at <= end_dt,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .all()
    ) if tenant_ids else []

    def revenue_in(ps: list[Payment], s: datetime, e: datetime) -> int:
        return sum(p.owner_net_amount or 0 for p in ps if p.created_at and s <= p.created_at <= e)

    rev_current = revenue_in(payments, start_dt, end_dt)
    rev_prev = revenue_in(payments, prev_start, prev_end)

    active_subs = 0
    if tenant_ids:
        active_subs = (
            db.query(func.count(Subscription.id))
            .filter(
                Subscription.tenant_id.in_(tenant_ids),
                Subscription.status.in_(["active", "trialing", "past_due", "canceling"]),
            )
            .scalar()
            or 0
        )

    avg_value = 0
    succeeded_current = [p for p in payments if p.created_at and start_dt <= p.created_at <= end_dt]
    if succeeded_current:
        avg_value = rev_current // max(1, len(succeeded_current))

    total_spaces = len(space_ids)
    period_hours = max(1.0, (end_dt - start_dt).total_seconds() / 3600.0)
    booked_hours = sum(_booking_hours(b) for b in confirmed_current)
    occupancy_pct = round(min(100.0, (booked_hours / (total_spaces * period_hours)) * 100.0), 1) if total_spaces else 0.0

    # Retention: members in current with bookings in previous window
    current_members = {b.user_id for b in current_bookings}
    prev_members = {b.user_id for b in prev_bookings}
    returning = len(current_members & prev_members)
    retention_pct = round((returning / len(current_members) * 100.0), 1) if current_members else 0.0

    no_show_count = sum(1 for b in confirmed_current if b.end_datetime < datetime.now(timezone.utc) and b.checked_in_at is None)
    no_show_rate = round((no_show_count / len(confirmed_current) * 100.0), 1) if confirmed_current else 0.0

    def delta_pct(cur: float, prev: float) -> float | None:
        if prev == 0:
            return None
        return round((cur - prev) / prev * 100.0, 1)

    return {
        "range": {"start": start_dt.date().isoformat(), "end": end_dt.date().isoformat()},
        "kpis": {
            "revenue": {"current": rev_current, "previous": rev_prev, "delta_pct": delta_pct(rev_current, rev_prev)},
            "bookings": {
                "current": len(current_bookings),
                "previous": len(prev_bookings),
                "delta_pct": delta_pct(len(current_bookings), len(prev_bookings)),
            },
            "cancellations": {"current": len(canceled_current), "previous": sum(1 for b in prev_bookings if b.status == BookingStatus.CANCELED)},
            "avg_booking_value": avg_value,
            "active_memberships": active_subs,
            "occupancy_pct": occupancy_pct,
            "retention_pct": retention_pct,
            "no_show_rate_pct": no_show_rate,
            "total_spaces": total_spaces,
            "total_locations": len(location_ids),
        },
    }


@router.get("/analytics/owner/revenue")
def owner_revenue(
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    group_by: str = Query("none", pattern="^(none|space_type|location)$"),
    format: str = Query("json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id.in_(tenant_ids),
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .all()
    )

    # Bucket helper
    def bucket(dt: datetime) -> str:
        if granularity == "week":
            iso_year, iso_week, _ = dt.isocalendar()
            return f"{iso_year}-W{iso_week:02d}"
        if granularity == "month":
            return dt.strftime("%Y-%m")
        return dt.date().isoformat()

    series: dict[str, dict[str, int]] = {}
    group_key_for_space: dict[int, str] = {}
    if group_by != "none":
        if group_by == "space_type":
            for s in db.query(Space).filter(Space.id.in_(space_ids)).all() if space_ids else []:
                group_key_for_space[s.id] = s.space_type
        else:  # location
            loc_by_id = {loc.id: loc for loc in db.query(Location).filter(Location.id.in_(location_ids)).all()} if location_ids else {}
            spaces = db.query(Space).filter(Space.id.in_(space_ids)).all() if space_ids else []
            for s in spaces:
                loc = loc_by_id.get(s.location_id)
                group_key_for_space[s.id] = loc.name if loc else "Unknown"

    def payment_group(payment: Payment) -> str:
        if group_by == "none":
            return "revenue"
        booking = None
        if payment.booking_id:
            booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
        if booking:
            return group_key_for_space.get(booking.space_id, "Unknown")
        if payment.subscription_id:
            sub = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
            if sub:
                return group_key_for_space.get(sub.space_id, "Unknown")
        return "Unknown"

    for p in payments:
        if not p.created_at:
            continue
        b = bucket(p.created_at)
        g = payment_group(p)
        series.setdefault(b, {})
        series[b][g] = series[b].get(g, 0) + (p.owner_net_amount or 0)

    buckets_sorted = sorted(series.keys())
    groups = sorted({g for b in series.values() for g in b.keys()}) or ["revenue"]
    rows = [{"bucket": b, **{g: series[b].get(g, 0) for g in groups}} for b in buckets_sorted]

    if format in {"csv", "pdf"}:
        columns = ["bucket"] + groups
        if format == "csv":
            return _respond("csv", None, csv_bytes=rows_to_csv(columns, rows), filename="revenue")
        return _respond(
            "pdf",
            None,
            pdf_bytes=rows_to_pdf(
                "Revenue Report",
                f"{start_dt.date()} → {end_dt.date()} · granularity {granularity}",
                columns,
                rows,
            ),
            filename="revenue",
        )

    return {"granularity": granularity, "groups": groups, "rows": rows}


@router.get("/analytics/owner/occupancy")
def owner_occupancy(
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = Query("day", pattern="^(day|week)$"),
    location_public_id: str | None = None,
    space_type: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    spaces_q = db.query(Space).filter(Space.id.in_(space_ids)) if space_ids else None
    if spaces_q is None:
        return {"granularity": granularity, "rows": []}

    if location_public_id:
        loc = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not loc or loc.id not in location_ids:
            raise HTTPException(status_code=404, detail="Location not found")
        spaces_q = spaces_q.filter(Space.location_id == loc.id)
    if space_type:
        spaces_q = spaces_q.filter(Space.space_type == space_type)

    filtered_spaces = spaces_q.all()
    if not filtered_spaces:
        return {"granularity": granularity, "rows": []}

    filtered_ids = [s.id for s in filtered_spaces]

    bookings = (
        db.query(Booking)
        .filter(
            Booking.space_id.in_(filtered_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.end_datetime >= start_dt,
            Booking.start_datetime <= end_dt,
        )
        .all()
    )

    rows: list[dict[str, Any]] = []
    if granularity == "day":
        for d in _iterate_days(start_dt, end_dt):
            day_start = datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
            day_end = day_start + timedelta(days=1)
            booked = sum(_overlap_hours(b.start_datetime, b.end_datetime, day_start, day_end) for b in bookings)
            capacity = len(filtered_spaces) * 24.0
            pct = round((booked / capacity) * 100.0, 1) if capacity else 0.0
            rows.append({"bucket": d.isoformat(), "booked_hours": round(booked, 2), "capacity_hours": capacity, "occupancy_pct": pct})
    else:
        # week buckets (Mon–Sun)
        cur = start_dt
        while cur.date() <= end_dt.date():
            week_start = cur - timedelta(days=cur.weekday())
            week_start = datetime.combine(week_start.date(), datetime.min.time(), tzinfo=timezone.utc)
            week_end = week_start + timedelta(days=7)
            overlap_start = max(week_start, start_dt)
            overlap_end = min(week_end, end_dt + timedelta(seconds=1))
            booked = sum(_overlap_hours(b.start_datetime, b.end_datetime, overlap_start, overlap_end) for b in bookings)
            hours_in_window = max(0.0, (overlap_end - overlap_start).total_seconds() / 3600.0)
            capacity = len(filtered_spaces) * hours_in_window
            pct = round((booked / capacity) * 100.0, 1) if capacity else 0.0
            iso_year, iso_week, _ = week_start.isocalendar()
            rows.append({
                "bucket": f"{iso_year}-W{iso_week:02d}",
                "booked_hours": round(booked, 2),
                "capacity_hours": round(capacity, 2),
                "occupancy_pct": pct,
            })
            cur = week_end

    return {"granularity": granularity, "rows": rows}


@router.get("/analytics/owner/peak-hours")
def owner_peak_hours(
    start_date: str | None = None,
    end_date: str | None = None,
    location_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    """Heatmap: rows=day-of-week (0=Mon..6=Sun), columns=hour (0-23), cell=booking hours."""
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=90)

    if not space_ids:
        return {"matrix": [[0] * 24 for _ in range(7)], "rows": 7, "cols": 24}

    target_space_ids = space_ids
    if location_public_id:
        loc = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not loc or loc.id not in location_ids:
            raise HTTPException(status_code=404, detail="Location not found")
        target_space_ids = [
            sid
            for (sid,) in db.query(Space.id).filter(Space.location_id == loc.id, Space.id.in_(space_ids)).all()
        ]

    bookings = (
        db.query(Booking)
        .filter(
            Booking.space_id.in_(target_space_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.end_datetime >= start_dt,
            Booking.start_datetime <= end_dt,
        )
        .all()
    )

    matrix = [[0.0] * 24 for _ in range(7)]
    for b in bookings:
        bs = max(b.start_datetime, start_dt)
        be = min(b.end_datetime, end_dt)
        if be <= bs:
            continue
        cur = bs
        while cur < be:
            hour_end = cur.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            slice_end = min(hour_end, be)
            hours = (slice_end - cur).total_seconds() / 3600.0
            matrix[cur.weekday()][cur.hour] += hours
            cur = slice_end

    return {
        "matrix": [[round(c, 2) for c in row] for row in matrix],
        "rows": 7,
        "cols": 24,
    }


@router.get("/analytics/owner/revenue-per-space")
def owner_revenue_per_space(
    start_date: str | None = None,
    end_date: str | None = None,
    format: str = Query("json", pattern="^(json|csv|pdf)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    spaces = db.query(Space).filter(Space.id.in_(space_ids)).all() if space_ids else []
    location_name = {loc.id: loc.name for loc in db.query(Location).filter(Location.id.in_(location_ids)).all()} if location_ids else {}

    bookings = (
        db.query(Booking)
        .filter(
            Booking.space_id.in_(space_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.end_datetime >= start_dt,
            Booking.start_datetime <= end_dt,
        )
        .all()
    ) if space_ids else []

    payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id.in_(tenant_ids),
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .all()
    )

    booking_to_space = {b.id: b.space_id for b in bookings}
    sub_to_space = {
        s.id: s.space_id
        for s in db.query(Subscription).filter(Subscription.tenant_id.in_(tenant_ids)).all()
    } if tenant_ids else {}

    per_space: dict[int, dict[str, Any]] = {
        s.id: {
            "space_public_id": s.public_id,
            "space_name": s.name or "Unnamed",
            "space_type": s.space_type,
            "location_name": location_name.get(s.location_id, ""),
            "bookings": 0,
            "hours_booked": 0.0,
            "gross": 0,
            "owner_net": 0,
        }
        for s in spaces
    }

    for b in bookings:
        if b.space_id not in per_space:
            continue
        per_space[b.space_id]["bookings"] += 1
        per_space[b.space_id]["hours_booked"] += _booking_hours(b)

    for p in payments:
        target_space = None
        if p.booking_id:
            target_space = booking_to_space.get(p.booking_id)
        if target_space is None and p.subscription_id:
            target_space = sub_to_space.get(p.subscription_id)
        if target_space is None or target_space not in per_space:
            continue
        per_space[target_space]["gross"] += p.amount or 0
        per_space[target_space]["owner_net"] += p.owner_net_amount or 0

    rows = []
    for row in per_space.values():
        hours = row["hours_booked"] or 0.0
        row["avg_revenue_per_hour"] = round(row["owner_net"] / hours, 2) if hours else 0
        row["hours_booked"] = round(hours, 2)
        rows.append(row)

    rows.sort(key=lambda r: r["owner_net"], reverse=True)

    if format in {"csv", "pdf"}:
        columns = [
            "space_public_id",
            "space_name",
            "space_type",
            "location_name",
            "bookings",
            "hours_booked",
            "gross",
            "owner_net",
            "avg_revenue_per_hour",
        ]
        if format == "csv":
            return _respond("csv", None, csv_bytes=rows_to_csv(columns, rows), filename="revenue-per-space")
        return _respond(
            "pdf",
            None,
            pdf_bytes=rows_to_pdf(
                "Revenue per Space",
                f"{start_dt.date()} → {end_dt.date()}",
                columns,
                rows,
            ),
            filename="revenue-per-space",
        )

    return {"rows": rows}


@router.get("/analytics/owner/retention")
def owner_retention(
    months: int = Query(6, ge=2, le=12),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    """Monthly cohort retention grid: for members whose first booking was in cohort month M,
    how many had any booking in month M+k (k = 0..months-1)."""
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    if not space_ids:
        return {"cohorts": []}

    now = datetime.now(timezone.utc)
    first_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc) - timedelta(days=30 * (months - 1))
    first_month = datetime(first_month.year, first_month.month, 1, tzinfo=timezone.utc)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.space_id.in_(space_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.start_datetime >= first_month,
        )
        .all()
    )

    def month_key(dt: datetime) -> str:
        return dt.strftime("%Y-%m")

    user_first: dict[int, str] = {}
    user_months: dict[int, set[str]] = {}
    for b in bookings:
        mk = month_key(b.start_datetime)
        user_months.setdefault(b.user_id, set()).add(mk)
        if b.user_id not in user_first or mk < user_first[b.user_id]:
            user_first[b.user_id] = mk

    cohort_keys: list[str] = []
    cur = first_month
    for _ in range(months):
        cohort_keys.append(month_key(cur))
        next_month = (cur.replace(day=28) + timedelta(days=4)).replace(day=1)
        cur = next_month

    cohorts: list[dict[str, Any]] = []
    for idx, ckey in enumerate(cohort_keys):
        members = [uid for uid, first in user_first.items() if first == ckey]
        size = len(members)
        retention: list[dict[str, Any]] = []
        for offset in range(months - idx):
            target = cohort_keys[idx + offset]
            count = sum(1 for uid in members if target in user_months.get(uid, set()))
            retention.append({
                "offset": offset,
                "month": target,
                "retained": count,
                "pct": round(count / size * 100.0, 1) if size else 0.0,
            })
        cohorts.append({"cohort": ckey, "size": size, "retention": retention})

    return {"cohorts": cohorts}


@router.get("/analytics/owner/top-members")
def owner_top_members(
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, location_ids, space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=90)

    if not space_ids:
        return {"rows": []}

    bookings = (
        db.query(Booking)
        .filter(
            Booking.space_id.in_(space_ids),
            Booking.created_at >= start_dt,
            Booking.created_at <= end_dt,
        )
        .all()
    )

    payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id.in_(tenant_ids),
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .all()
    )

    per_user: dict[int, dict[str, Any]] = {}
    for b in bookings:
        per_user.setdefault(b.user_id, {"bookings": 0, "spend": 0, "last_booking": None})
        per_user[b.user_id]["bookings"] += 1
        if b.created_at and (per_user[b.user_id]["last_booking"] is None or b.created_at > per_user[b.user_id]["last_booking"]):
            per_user[b.user_id]["last_booking"] = b.created_at
    for p in payments:
        per_user.setdefault(p.user_id, {"bookings": 0, "spend": 0, "last_booking": None})
        per_user[p.user_id]["spend"] += p.amount or 0

    user_ids = list(per_user.keys())
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    rows = [
        {
            "user_public_id": users.get(uid).public_id if users.get(uid) else None,
            "email": users.get(uid).email if users.get(uid) else None,
            "name": users.get(uid).full_name if users.get(uid) else None,
            "bookings": v["bookings"],
            "spend": v["spend"],
            "last_booking": v["last_booking"].isoformat() if v["last_booking"] else None,
        }
        for uid, v in per_user.items()
    ]
    rows.sort(key=lambda r: r["spend"], reverse=True)
    rows = rows[:limit]

    if format == "csv":
        columns = ["email", "name", "bookings", "spend", "last_booking"]
        return _respond("csv", None, csv_bytes=rows_to_csv(columns, rows), filename="top-members")

    return {"rows": rows}


@router.get("/analytics/owner/monthly-statement.pdf")
def owner_monthly_statement(
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user, tenant_ids, _location_ids, _space_ids = _require_owner(db, token)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id.in_(tenant_ids),
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
            Payment.status == PaymentStatus.SUCCEEDED,
        )
        .all()
    )
    total_gross = sum(p.amount or 0 for p in payments)
    total_fee = sum(p.platform_fee_amount or 0 for p in payments)
    total_net = sum(p.owner_net_amount or 0 for p in payments)

    rows = [
        {
            "date": p.created_at.date().isoformat() if p.created_at else "",
            "payment_id": p.public_id,
            "gross": p.amount or 0,
            "fee": p.platform_fee_amount or 0,
            "net": p.owner_net_amount or 0,
        }
        for p in payments
    ]
    rows.sort(key=lambda r: r["date"])
    columns = ["date", "payment_id", "gross", "fee", "net"]
    footer = f"Totals — Gross: {total_gross} · Fee: {total_fee} · Net: {total_net}"
    pdf = rows_to_pdf(
        "Owner Monthly Statement",
        f"{start_dt.date()} → {end_dt.date()}",
        columns,
        rows,
        footer=footer,
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="owner-monthly-statement.pdf"'},
    )


# ---------- Admin endpoints ----------


@router.get("/analytics/admin/platform")
def admin_platform(
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    def bucket(dt: datetime) -> str:
        if granularity == "week":
            iso_year, iso_week, _ = dt.isocalendar()
            return f"{iso_year}-W{iso_week:02d}"
        if granularity == "month":
            return dt.strftime("%Y-%m")
        return dt.date().isoformat()

    payments = (
        db.query(Payment)
        .filter(
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
        .all()
    )
    series: dict[str, dict[str, int]] = {}
    for p in payments:
        if not p.created_at:
            continue
        key = bucket(p.created_at)
        series.setdefault(key, {"gmv": 0, "platform_earnings": 0, "owner_net": 0, "failed": 0})
        if p.status == PaymentStatus.SUCCEEDED:
            series[key]["gmv"] += p.amount or 0
            series[key]["platform_earnings"] += p.platform_fee_amount or 0
            series[key]["owner_net"] += p.owner_net_amount or 0
        elif p.status == PaymentStatus.FAILED:
            series[key]["failed"] += 1

    signups = (
        db.query(User)
        .filter(User.created_at >= start_dt, User.created_at <= end_dt)
        .all()
    )
    sig_series: dict[str, dict[str, int]] = {}
    for u in signups:
        if not u.created_at:
            continue
        key = bucket(u.created_at)
        sig_series.setdefault(key, {"members": 0, "owners": 0})
        if u.role == UserAppRole.MEMBER:
            sig_series[key]["members"] += 1
        elif u.role == UserAppRole.OWNER:
            sig_series[key]["owners"] += 1

    all_buckets = sorted(set(series.keys()) | set(sig_series.keys()))
    rows = [
        {
            "bucket": b,
            **series.get(b, {"gmv": 0, "platform_earnings": 0, "owner_net": 0, "failed": 0}),
            **sig_series.get(b, {"members": 0, "owners": 0}),
        }
        for b in all_buckets
    ]

    total_gmv = sum(p.amount or 0 for p in payments if p.status == PaymentStatus.SUCCEEDED)
    total_fee = sum(p.platform_fee_amount or 0 for p in payments if p.status == PaymentStatus.SUCCEEDED)
    take_rate_pct = round((total_fee / total_gmv * 100.0), 2) if total_gmv else 0.0

    return {
        "granularity": granularity,
        "rows": rows,
        "summary": {
            "gmv": total_gmv,
            "platform_earnings": total_fee,
            "take_rate_pct": take_rate_pct,
            "failed_payments": sum(1 for p in payments if p.status == PaymentStatus.FAILED),
            "new_members": sum(1 for u in signups if u.role == UserAppRole.MEMBER),
            "new_owners": sum(1 for u in signups if u.role == UserAppRole.OWNER),
        },
    }


@router.get("/analytics/admin/cities")
def admin_cities(
    start_date: str | None = None,
    end_date: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    start_dt, end_dt = _default_range(start_date, end_date, days=90)

    bookings = (
        db.query(Booking)
        .filter(
            Booking.created_at >= start_dt,
            Booking.created_at <= end_dt,
        )
        .all()
    )
    space_ids = list({b.space_id for b in bookings})
    spaces = {s.id: s for s in db.query(Space).filter(Space.id.in_(space_ids)).all()} if space_ids else {}
    location_ids = list({s.location_id for s in spaces.values()})
    locations = {loc.id: loc for loc in db.query(Location).filter(Location.id.in_(location_ids)).all()} if location_ids else {}

    per_city: dict[str, dict[str, Any]] = {}
    for b in bookings:
        space = spaces.get(b.space_id)
        if not space:
            continue
        loc = locations.get(space.location_id)
        if not loc:
            continue
        key = loc.city or "Unknown"
        per_city.setdefault(key, {"city": key, "bookings": 0, "lat_sum": 0.0, "lng_sum": 0.0, "lat_count": 0})
        per_city[key]["bookings"] += 1
        if loc.lat is not None and loc.lng is not None:
            per_city[key]["lat_sum"] += loc.lat
            per_city[key]["lng_sum"] += loc.lng
            per_city[key]["lat_count"] += 1

    rows = []
    for row in per_city.values():
        c = row["lat_count"]
        rows.append({
            "city": row["city"],
            "bookings": row["bookings"],
            "lat": row["lat_sum"] / c if c else None,
            "lng": row["lng_sum"] / c if c else None,
        })
    rows.sort(key=lambda r: r["bookings"], reverse=True)
    return {"rows": rows}


@router.get("/analytics/admin/org-leaderboard")
def admin_org_leaderboard(
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = Query(10, ge=1, le=50),
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    payments = (
        db.query(Payment)
        .filter(
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        )
        .all()
    )
    per_tenant: dict[int, dict[str, int]] = {}
    for p in payments:
        if p.tenant_id is None:
            continue
        per_tenant.setdefault(p.tenant_id, {"gmv": 0, "platform": 0, "net": 0, "count": 0})
        per_tenant[p.tenant_id]["gmv"] += p.amount or 0
        per_tenant[p.tenant_id]["platform"] += p.platform_fee_amount or 0
        per_tenant[p.tenant_id]["net"] += p.owner_net_amount or 0
        per_tenant[p.tenant_id]["count"] += 1

    orgs = {o.id: o for o in db.query(Organization).filter(Organization.id.in_(per_tenant.keys())).all()} if per_tenant else {}
    rows = [
        {
            "organization_public_id": orgs[tid].public_id if tid in orgs else None,
            "organization_name": orgs[tid].name if tid in orgs else "Unknown",
            "review_status": orgs[tid].review_status.value if tid in orgs else None,
            "gmv": v["gmv"],
            "platform_earnings": v["platform"],
            "owner_net": v["net"],
            "payments": v["count"],
        }
        for tid, v in per_tenant.items()
    ]
    rows.sort(key=lambda r: r["gmv"], reverse=True)
    rows = rows[:limit]

    if format == "csv":
        columns = ["organization_name", "review_status", "gmv", "platform_earnings", "owner_net", "payments"]
        return _respond("csv", None, csv_bytes=rows_to_csv(columns, rows), filename="org-leaderboard")

    return {"rows": rows}


@router.get("/analytics/admin/reports/{kind}")
def admin_reports(
    kind: str,
    start_date: str | None = None,
    end_date: str | None = None,
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    require_platform_roles(db, token, READ_ROLES)
    start_dt, end_dt = _default_range(start_date, end_date, days=30)

    if kind == "reconciliation":
        payments = db.query(Payment).filter(
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        ).all()
        rows = [
            {
                "date": p.created_at.date().isoformat() if p.created_at else "",
                "payment_id": p.public_id,
                "gross": p.amount or 0,
                "fee": p.platform_fee_amount or 0,
                "net": p.owner_net_amount or 0,
            }
            for p in payments
        ]
        columns = ["date", "payment_id", "gross", "fee", "net"]
        title = "GMV Reconciliation"
    elif kind == "failed-payments":
        payments = db.query(Payment).filter(
            Payment.status == PaymentStatus.FAILED,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        ).all()
        users = {u.id: u for u in db.query(User).filter(User.id.in_([p.user_id for p in payments])).all()} if payments else {}
        rows = [
            {
                "date": p.created_at.date().isoformat() if p.created_at else "",
                "payment_id": p.public_id,
                "user_email": users.get(p.user_id).email if users.get(p.user_id) else "",
                "amount": p.amount or 0,
            }
            for p in payments
        ]
        columns = ["date", "payment_id", "user_email", "amount"]
        title = "Failed Payments"
    elif kind == "payouts":
        payments = db.query(Payment).filter(
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.created_at >= start_dt,
            Payment.created_at <= end_dt,
        ).all()
        per_org: dict[int, dict[str, int]] = {}
        for p in payments:
            if p.tenant_id is None:
                continue
            per_org.setdefault(p.tenant_id, {"net": 0, "count": 0})
            per_org[p.tenant_id]["net"] += p.owner_net_amount or 0
            per_org[p.tenant_id]["count"] += 1
        orgs = {o.id: o for o in db.query(Organization).filter(Organization.id.in_(per_org.keys())).all()} if per_org else {}
        rows = [
            {
                "organization": orgs.get(tid).name if orgs.get(tid) else "",
                "payments": v["count"],
                "owner_net": v["net"],
            }
            for tid, v in per_org.items()
        ]
        columns = ["organization", "payments", "owner_net"]
        title = "Owner Payouts"
    else:
        raise HTTPException(status_code=404, detail="Unknown report kind")

    subtitle = f"{start_dt.date()} → {end_dt.date()}"
    if format == "csv":
        return Response(
            content=rows_to_csv(columns, rows),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{kind}.csv"'},
        )
    return Response(
        content=rows_to_pdf(title, subtitle, columns, rows),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{kind}.pdf"'},
    )


# ---------- Member endpoints ----------


@router.get("/analytics/me/summary")
def my_summary(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    bookings = db.query(Booking).filter(Booking.user_id == user.id).all()
    payments = db.query(Payment).filter(Payment.user_id == user.id).all()

    total_hours = sum(_booking_hours(b) for b in bookings if b.status == BookingStatus.CONFIRMED)
    total_spent = sum(p.amount or 0 for p in payments if p.status == PaymentStatus.SUCCEEDED)
    now = datetime.now(timezone.utc)
    upcoming = sorted(
        [b for b in bookings if b.start_datetime > now and b.status == BookingStatus.CONFIRMED],
        key=lambda b: b.start_datetime,
    )[:5]
    past = [b for b in bookings if b.end_datetime <= now and b.status == BookingStatus.CONFIRMED]

    # favourite space
    from collections import Counter
    space_counter = Counter(b.space_id for b in bookings if b.status == BookingStatus.CONFIRMED)
    fav_space_id, _ = space_counter.most_common(1)[0] if space_counter else (None, 0)
    fav_space = db.query(Space).filter(Space.id == fav_space_id).first() if fav_space_id else None
    fav_location = db.query(Location).filter(Location.id == fav_space.location_id).first() if fav_space else None

    # usual day/hour
    dow_counter = Counter(b.start_datetime.weekday() for b in bookings if b.status == BookingStatus.CONFIRMED)
    hour_counter = Counter(b.start_datetime.hour for b in bookings if b.status == BookingStatus.CONFIRMED)
    usual_day = dow_counter.most_common(1)[0][0] if dow_counter else None
    usual_hour = hour_counter.most_common(1)[0][0] if hour_counter else None

    # Visit series last 12 weeks
    horizon = now - timedelta(weeks=12)
    week_counter: Counter = Counter()
    for b in bookings:
        if b.status != BookingStatus.CONFIRMED or b.start_datetime < horizon:
            continue
        iso_year, iso_week, _ = b.start_datetime.isocalendar()
        week_counter[f"{iso_year}-W{iso_week:02d}"] += 1
    visit_series = [{"bucket": k, "visits": v} for k, v in sorted(week_counter.items())]

    return {
        "totals": {
            "visits": sum(1 for b in bookings if b.status == BookingStatus.CONFIRMED),
            "hours": round(total_hours, 2),
            "spent": total_spent,
            "upcoming": len(upcoming),
            "past": len(past),
        },
        "favourite_space": {
            "space_public_id": fav_space.public_id if fav_space else None,
            "space_name": (fav_space.name or "") if fav_space else None,
            "location_name": fav_location.name if fav_location else None,
        },
        "usual": {
            "day_of_week": usual_day,
            "hour": usual_hour,
        },
        "upcoming": [
            {
                "public_id": b.public_id,
                "start_datetime": b.start_datetime.isoformat(),
                "end_datetime": b.end_datetime.isoformat(),
            }
            for b in upcoming
        ],
        "visit_series": visit_series,
    }
