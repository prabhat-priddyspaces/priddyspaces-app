from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking_request import BookingRequest
from app.models.booking_waitlist import BookingWaitlistEntry
from app.models.enums import (
    BookingRequestKind,
    BookingRequestStatus,
    BookingWaitlistStatus,
    LocationStatus,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.user import User
from app.schemas.booking_waitlist import BookingWaitlistCreate, BookingWaitlistInvite, BookingWaitlistOut
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, require_location_roles, user_can_access_location
from app.services.availability import subscription_overlaps
from app.services.booking_inventory import expand_occurrences, validate_occurrences_available
from app.services.booking_products import validate_direct_booking_product
from app.services.meeting_room_balance import add_months
from app.services.notifications import send_email
from app.services.platform_auth import organization_is_publicly_visible

router = APIRouter()

ACTIVE_WAITLIST_STATUSES = {
    BookingWaitlistStatus.WAITLISTED.value,
    BookingWaitlistStatus.INVITED.value,
}
EXCLUSIVE_LEASE_MODES = {"private_office_lease", "suite_lease"}


def _as_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _resolve_tz(name: str | None) -> ZoneInfo:
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _display_name(user: User | None) -> str | None:
    if not user:
        return None
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    parts = [part.strip() for part in [user.first_name or "", user.last_name or ""] if part and part.strip()]
    return " ".join(parts) if parts else user.email


def _space_name(space: Space | None) -> str | None:
    if not space:
        return None
    if space.name and space.name.strip():
        return space.name.strip()
    raw = getattr(space.space_type, "value", space.space_type)
    return str(raw).replace("_", " ").title()


def _require_public_waitlist_space(db: Session, space: Space) -> tuple[Location, Organization]:
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Space not found")
    organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
    if (
        not organization
        or space.visibility == SpaceVisibility.PRIVATE
        or location.status != LocationStatus.ACTIVE
        or not organization_is_publicly_visible(organization)
    ):
        raise HTTPException(status_code=404, detail="Space not found")
    if not organization.waitlist_enabled:
        raise HTTPException(status_code=400, detail="This owner has not enabled waitlists")
    return location, organization


def _lease_request_overlaps(db: Session, *, space_id: int, start: date, end: date | None) -> bool:
    end_date = end or date.max
    start_dt = datetime.combine(start, time.min, tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, time.min, tzinfo=timezone.utc)
    return (
        db.query(BookingRequest)
        .filter(
            BookingRequest.space_id == space_id,
            BookingRequest.request_kind == BookingRequestKind.LEASE_PURCHASE.value,
            BookingRequest.status.in_([BookingRequestStatus.REQUESTED, BookingRequestStatus.PAYMENT_FAILED]),
            BookingRequest.start_datetime < end_dt,
            BookingRequest.end_datetime > start_dt,
        )
        .first()
        is not None
    )


def _membership_unavailable(db: Session, *, plan: MembershipPlan, space: Space, desired_start: date) -> bool:
    if plan.max_active_subscriptions:
        from app.models.subscription import Subscription

        active_count = (
            db.query(Subscription)
            .filter(
                Subscription.membership_plan_id == plan.id,
                Subscription.status.in_(["active", "past_due"]),
            )
            .count()
        )
        if active_count >= plan.max_active_subscriptions:
            return True
    if plan.booking_mode in EXCLUSIVE_LEASE_MODES:
        commitment_end = add_months(desired_start, plan.commitment_months or 1)
        return subscription_overlaps(db, space.id, desired_start, commitment_end) or _lease_request_overlaps(
            db,
            space_id=space.id,
            start=desired_start,
            end=commitment_end,
        )
    return False


def _booking_href(entry: BookingWaitlistEntry, space: Space | None, location: Location | None, plan: MembershipPlan | None) -> str | None:
    if not space:
        return None
    params: list[tuple[str, str]] = [("waitlist", entry.public_id)]
    if plan and entry.desired_start_date:
        params.extend([("plan", plan.public_id), ("move_in", entry.desired_start_date.isoformat())])
    elif entry.start_datetime and entry.end_datetime:
        tz = _resolve_tz(location.timezone if location else None)
        start_local = _as_utc(entry.start_datetime).astimezone(tz)
        end_local = _as_utc(entry.end_datetime).astimezone(tz)
        params.extend(
            [
                ("date", start_local.date().isoformat()),
                ("start_time", start_local.strftime("%H:%M")),
                ("end_time", end_local.strftime("%H:%M")),
            ]
        )
    query = "&".join(f"{key}={value}" for key, value in params)
    return f"/spaces/{space.public_id}?{query}"


def _to_out(db: Session, entry: BookingWaitlistEntry) -> BookingWaitlistOut:
    space = db.query(Space).filter(Space.id == entry.space_id).first()
    location = db.query(Location).filter(Location.id == entry.location_id).first()
    organization = db.query(Organization).filter(Organization.id == entry.organization_id).first()
    user = db.query(User).filter(User.id == entry.user_id).first()
    plan = db.query(MembershipPlan).filter(MembershipPlan.id == entry.membership_plan_id).first() if entry.membership_plan_id else None
    booking_request = (
        db.query(BookingRequest).filter(BookingRequest.id == entry.booking_request_id).first()
        if entry.booking_request_id
        else None
    )
    return BookingWaitlistOut(
        public_id=entry.public_id,
        created_at=entry.created_at,
        status=entry.status,
        space_public_id=space.public_id if space else None,
        space_name=_space_name(space),
        space_type=(space.space_type.value if hasattr(space.space_type, "value") else str(space.space_type)) if space else None,
        organization_name=organization.name if organization else None,
        location_public_id=location.public_id if location else None,
        location_name=location.name if location else None,
        location_city=location.city if location else None,
        member_public_id=user.public_id if user else None,
        member_name=_display_name(user),
        member_email=user.email if user else None,
        membership_plan_public_id=plan.public_id if plan else None,
        membership_plan_name=plan.name if plan else None,
        booking_request_public_id=booking_request.public_id if booking_request else None,
        request_kind=entry.request_kind,
        booking_mode=entry.booking_mode,
        full_day=entry.full_day or False,
        seats_requested=entry.seats_requested or 1,
        start_datetime=entry.start_datetime,
        end_datetime=entry.end_datetime,
        desired_start_date=entry.desired_start_date,
        invited_at=entry.invited_at,
        invite_expires_at=entry.invite_expires_at,
        cancelled_at=entry.cancelled_at,
        booked_at=entry.booked_at,
        operator_notes=entry.operator_notes,
        booking_href=_booking_href(entry, space, location, plan),
    )


def _owner_recipients_for_space(db: Session, space: Space) -> list[str]:
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        return []
    members = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.receives_new_booking_email.is_(True),
            OrganizationMember.role.in_([UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF]),
        )
        .all()
    )
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_([member.user_id for member in members])).all()
    }
    emails: list[str] = []
    seen: set[str] = set()
    for member in members:
        user = users.get(member.user_id)
        if not user or not user.email or user.email in seen:
            continue
        if not user_can_access_location(db, member.user_id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}):
            continue
        seen.add(user.email)
        emails.append(user.email)
    return emails


def _notify_joined(db: Session, entry: BookingWaitlistEntry, member: User, space: Space) -> None:
    if member.email:
        send_email(
            member.email,
            "You joined the waitlist",
            f"You are on the waitlist for {_space_name(space)}. The owner will invite you if they can accommodate the request.",
            db=db,
        )
    for email in _owner_recipients_for_space(db, space):
        send_email(
            email,
            "New waitlist request",
            f"{_display_name(member)} joined the waitlist for {_space_name(space)}. Reference: {entry.public_id}",
            db=db,
        )


@router.post("/booking-waitlist", response_model=BookingWaitlistOut)
def create_waitlist_entry(
    payload: BookingWaitlistCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Only members can join a waitlist")

    if payload.membership_plan_public_id:
        plan = (
            db.query(MembershipPlan)
            .filter(MembershipPlan.public_id == payload.membership_plan_public_id, MembershipPlan.is_active.is_(True))
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Membership plan not found")
        space = db.query(Space).filter(Space.id == plan.space_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        location, organization = _require_public_waitlist_space(db, space)
        mode_enabled = (
            db.query(SpaceBookingMode)
            .filter(
                SpaceBookingMode.space_id == space.id,
                SpaceBookingMode.booking_mode == plan.booking_mode,
                SpaceBookingMode.is_enabled.is_(True),
            )
            .first()
            is not None
        )
        if not mode_enabled:
            raise HTTPException(status_code=400, detail="This booking mode is not currently enabled for the space")
        if not _membership_unavailable(db, plan=plan, space=space, desired_start=payload.desired_start_date):
            raise HTTPException(status_code=400, detail="This plan is currently available; book it instead")
        duplicate = (
            db.query(BookingWaitlistEntry)
            .filter(
                BookingWaitlistEntry.user_id == user.id,
                BookingWaitlistEntry.membership_plan_id == plan.id,
                BookingWaitlistEntry.desired_start_date == payload.desired_start_date,
                BookingWaitlistEntry.status.in_(ACTIVE_WAITLIST_STATUSES),
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="You are already on this waitlist")
        commitment_end = add_months(payload.desired_start_date, plan.commitment_months or 1)
        entry = BookingWaitlistEntry(
            tenant_id=space.tenant_id,
            organization_id=organization.id,
            location_id=location.id,
            space_id=space.id,
            user_id=user.id,
            membership_plan_id=plan.id,
            request_kind=(
                BookingRequestKind.LEASE_PURCHASE.value
                if plan.booking_mode in EXCLUSIVE_LEASE_MODES
                else BookingRequestKind.MEMBERSHIP_PURCHASE.value
            ),
            booking_mode=plan.booking_mode,
            seats_requested=max(1, payload.seats_requested or 1),
            desired_start_date=payload.desired_start_date,
            start_datetime=datetime.combine(payload.desired_start_date, time.min, tzinfo=timezone.utc),
            end_datetime=datetime.combine(commitment_end, time.min, tzinfo=timezone.utc),
        )
    else:
        space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Space not found")
        location, organization = _require_public_waitlist_space(db, space)
        is_day_pass = bool(payload.full_day) or payload.booking_mode == "day_pass"
        validate_direct_booking_product(
            space,
            booking_mode=payload.booking_mode,
            full_day=payload.full_day,
            seats_requested=payload.seats_requested,
        )
        occurrences = expand_occurrences(
            start_datetime=payload.start_datetime,
            end_datetime=payload.end_datetime,
            location=location,
            space=space,
        )
        try:
            validate_occurrences_available(
                db,
                space=space,
                location=location,
                occurrences=occurrences,
                booking_mode="day_pass" if is_day_pass else "hourly",
                full_day=is_day_pass,
                seats_requested=payload.seats_requested,
            )
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
        else:
            raise HTTPException(status_code=400, detail="This slot is currently available; book it instead")
        duplicate = (
            db.query(BookingWaitlistEntry)
            .filter(
                BookingWaitlistEntry.user_id == user.id,
                BookingWaitlistEntry.space_id == space.id,
                BookingWaitlistEntry.start_datetime == occurrences[0].start_datetime,
                BookingWaitlistEntry.end_datetime == occurrences[0].end_datetime,
                BookingWaitlistEntry.status.in_(ACTIVE_WAITLIST_STATUSES),
            )
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="You are already on this waitlist")
        entry = BookingWaitlistEntry(
            tenant_id=space.tenant_id,
            organization_id=organization.id,
            location_id=location.id,
            space_id=space.id,
            user_id=user.id,
            request_kind=BookingRequestKind.DAILY_BOOKING.value if is_day_pass else BookingRequestKind.HOURLY_BOOKING.value,
            booking_mode="day_pass" if is_day_pass else "hourly",
            full_day=is_day_pass,
            seats_requested=max(1, payload.seats_requested or 1),
            start_datetime=occurrences[0].start_datetime,
            end_datetime=occurrences[0].end_datetime,
        )

    db.add(entry)
    db.commit()
    db.refresh(entry)
    _notify_joined(db, entry, user, space)
    return _to_out(db, entry)


@router.get("/booking-waitlist", response_model=list[BookingWaitlistOut])
def list_waitlist_entries(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    query = db.query(BookingWaitlistEntry)
    if user.role == UserAppRole.MEMBER:
        query = query.filter(BookingWaitlistEntry.user_id == user.id)
    else:
        location_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        if not location_ids:
            return []
        query = query.filter(BookingWaitlistEntry.location_id.in_(location_ids))
    return [_to_out(db, entry) for entry in query.order_by(BookingWaitlistEntry.created_at.desc()).all()]


@router.post("/booking-waitlist/{public_id}/cancel", response_model=BookingWaitlistOut)
def cancel_waitlist_entry(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    entry = db.query(BookingWaitlistEntry).filter(BookingWaitlistEntry.public_id == public_id).with_for_update().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    if user.role == UserAppRole.MEMBER:
        if entry.user_id != user.id:
            raise HTTPException(status_code=404, detail="Waitlist entry not found")
    else:
        location = db.query(Location).filter(Location.id == entry.location_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Waitlist entry not found")
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if entry.status not in ACTIVE_WAITLIST_STATUSES:
        raise HTTPException(status_code=400, detail="Waitlist entry is already closed")
    entry.status = BookingWaitlistStatus.CANCELLED.value
    entry.cancelled_at = datetime.now(timezone.utc)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_out(db, entry)


@router.post("/booking-waitlist/{public_id}/invite", response_model=BookingWaitlistOut)
def invite_waitlist_entry(
    public_id: str,
    payload: BookingWaitlistInvite,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    entry = db.query(BookingWaitlistEntry).filter(BookingWaitlistEntry.public_id == public_id).with_for_update().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    location = db.query(Location).filter(Location.id == entry.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Waitlist entry not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if entry.status not in ACTIVE_WAITLIST_STATUSES:
        raise HTTPException(status_code=400, detail="Waitlist entry is already closed")
    now = datetime.now(timezone.utc)
    entry.status = BookingWaitlistStatus.INVITED.value
    entry.invited_at = now
    entry.invite_expires_at = now + timedelta(hours=24)
    entry.operator_notes = payload.operator_notes
    db.add(entry)
    db.commit()
    db.refresh(entry)
    out = _to_out(db, entry)
    member = db.query(User).filter(User.id == entry.user_id).first()
    if member and member.email:
        send_email(
            member.email,
            "A waitlisted space is ready to book",
            f"The owner invited you to book {_space_name(db.query(Space).filter(Space.id == entry.space_id).first())}. Book here: {out.booking_href}",
            db=db,
        )
    return out
