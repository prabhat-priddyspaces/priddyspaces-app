from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.enums import BookingStatus, PlatformTeamRole, UserAppRole, UserRole
from app.models.location import Location
from app.models.space import Space
from app.models.space_access_pass import SpaceAccessPass
from app.models.space_attendance_record import SpaceAttendanceRecord
from app.models.user import User
from app.schemas.access_pass import (
    AccessPassEnsureIn,
    AccessPassOut,
    AccessPassResolveOut,
    AccessPassTokenIn,
    AttendanceListOut,
    AttendanceLocationOut,
    AttendanceRecordOut,
    MemberDirectoryItemOut,
)
from app.services.access_passes import (
    ACTIVE_PASS_STATUS,
    access_pass_to_out,
    directory_items_for_member,
    ensure_access_pass_for_booking,
    mark_check_in,
    mark_check_out,
    pass_context_for_token,
    pass_context_to_resolve_out,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, require_location_roles
from app.services.audit import write_audit_log
from app.services.platform_auth import get_active_platform_member, get_audit_actor_context

router = APIRouter()

PLATFORM_READ_ROLES = {PlatformTeamRole.SUPERADMIN, PlatformTeamRole.ADMIN, PlatformTeamRole.SUPPORT}
SCANNER_ORG_ROLES = {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF}


def _is_platform_reader(db: Session, user: User) -> bool:
    member = get_active_platform_member(db, user.id)
    return bool(member and member.role in PLATFORM_READ_ROLES)


def _scanner_authorize_context(db: Session, user: User, ctx) -> None:
    if not ctx.location:
        if ctx.pass_status == "invalid":
            return
        raise HTTPException(status_code=404, detail="Access pass not found")
    if _is_platform_reader(db, user):
        return
    require_location_roles(db, user.id, ctx.location, SCANNER_ORG_ROLES)


def _attendance_location_ids(
    db: Session,
    user: User,
    location_public_id: str | None,
) -> set[int]:
    if _is_platform_reader(db, user):
        query = db.query(Location.id)
        if location_public_id:
            location = db.query(Location).filter(Location.public_id == location_public_id).first()
            if not location:
                raise HTTPException(status_code=404, detail="Location not found")
            return {location.id}
        return {location_id for location_id, in query.all()}

    if user.role == UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Owner role required")
    loc_ids = accessible_location_ids(db, user.id, SCANNER_ORG_ROLES)
    if location_public_id:
        location = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not location or location.id not in loc_ids:
            raise HTTPException(status_code=404, detail="Location not found")
        return {location.id}
    return loc_ids


def _name_for(user: User | None) -> str | None:
    if not user:
        return None
    parts = [user.first_name or "", user.last_name or ""]
    return user.full_name or " ".join(part for part in parts if part).strip() or user.email


def _space_name(space: Space | None) -> str | None:
    if not space:
        return None
    return space.name or getattr(space.space_type, "value", space.space_type).replace("_", " ").title()


def _serialize_attendance(
    booking: Booking,
    access_pass: SpaceAccessPass,
    member: User,
    space: Space,
    location: Location,
    event: SpaceAttendanceRecord | None,
    scanner: User | None,
) -> AttendanceRecordOut:
    if booking.checked_out_at:
        status = "checked_out"
    elif booking.checked_in_at:
        status = "checked_in"
    else:
        status = "not_checked_in"
    return AttendanceRecordOut(
        public_id=event.public_id if event else None,
        booking_public_id=booking.public_id,
        access_pass_public_id=access_pass.public_id,
        member_public_id=member.public_id,
        member_name=_name_for(member),
        member_email=member.email,
        scanned_by_public_id=scanner.public_id if scanner else None,
        scanned_by_name=_name_for(scanner),
        location_public_id=location.public_id,
        location_name=location.name,
        space_public_id=space.public_id,
        space_name=_space_name(space),
        space_type=getattr(space.space_type, "value", space.space_type),
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        checked_in_at=booking.checked_in_at,
        checked_out_at=booking.checked_out_at,
        status=status,
        event_type=event.event_type if event else None,
        event_at=event.event_at if event else None,
    )


def _attendance_rows(
    db: Session,
    *,
    location_ids: set[int],
    day: date | None,
    space_type: str | None,
    currently_in_office: bool,
    status: str | None,
    search: str | None,
) -> list[tuple[Booking, SpaceAccessPass, User, Space, Location, SpaceAttendanceRecord | None, User | None]]:
    if not location_ids:
        return []
    query = (
        db.query(Booking, SpaceAccessPass, User, Space, Location)
        .join(SpaceAccessPass, SpaceAccessPass.booking_id == Booking.id)
        .join(User, User.id == SpaceAccessPass.user_id)
        .join(Space, Space.id == Booking.space_id)
        .join(Location, Location.id == Space.location_id)
        .filter(Space.location_id.in_(location_ids))
    )
    if day:
        start = datetime.combine(day, time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = query.filter(Booking.start_datetime < end, Booking.end_datetime >= start)
    if space_type:
        query = query.filter(Space.space_type == space_type)
    if currently_in_office:
        now = datetime.now(timezone.utc)
        query = query.filter(
            Booking.checked_in_at.isnot(None),
            Booking.checked_out_at.is_(None),
            Booking.end_datetime >= now,
        )
    elif status == "checked_in":
        query = query.filter(Booking.checked_in_at.isnot(None), Booking.checked_out_at.is_(None))
    elif status == "checked_out":
        query = query.filter(Booking.checked_out_at.isnot(None))
    if search:
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.email).like(term),
                func.lower(User.full_name).like(term),
                func.lower(User.first_name).like(term),
                func.lower(User.last_name).like(term),
            )
        )
    base_rows = query.order_by(Booking.start_datetime.desc()).all()
    event_by_booking: dict[int, SpaceAttendanceRecord] = {}
    booking_ids = [booking.id for booking, *_ in base_rows]
    if booking_ids:
        events = (
            db.query(SpaceAttendanceRecord)
            .filter(SpaceAttendanceRecord.booking_id.in_(booking_ids))
            .order_by(SpaceAttendanceRecord.event_at.desc())
            .all()
        )
        for event in events:
            event_by_booking.setdefault(event.booking_id, event)
    scanner_ids = {event.scanned_by_user_id for event in event_by_booking.values()}
    scanners = (
        {user.id: user for user in db.query(User).filter(User.id.in_(scanner_ids)).all()}
        if scanner_ids
        else {}
    )
    return [
        (booking, access_pass, member, space, location, event_by_booking.get(booking.id), scanners.get(event_by_booking.get(booking.id).scanned_by_user_id) if event_by_booking.get(booking.id) else None)
        for booking, access_pass, member, space, location in base_rows
    ]


@router.get("/access-passes", response_model=list[AccessPassOut])
def list_access_passes(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Member only")
    now = datetime.now(timezone.utc)
    for booking in (
        db.query(Booking)
        .filter(
            Booking.user_id == user.id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.end_datetime >= now,
        )
        .all()
    ):
        ensure_access_pass_for_booking(db, booking)
    db.commit()
    passes = (
        db.query(SpaceAccessPass)
        .filter(
            SpaceAccessPass.user_id == user.id,
            SpaceAccessPass.status == ACTIVE_PASS_STATUS,
            SpaceAccessPass.expires_at >= now,
        )
        .order_by(SpaceAccessPass.valid_from_at.asc())
        .all()
    )
    out = [access_pass_to_out(access_pass, db) for access_pass in passes]
    return [
        AccessPassOut(**item)
        for item in out
        if item["pass_status"] in {"not_yet_valid", "valid", "already_checked_in"}
    ]


@router.post("/access-passes", response_model=AccessPassOut)
def ensure_access_pass(
    payload: AccessPassEnsureIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Member only")
    booking = (
        db.query(Booking)
        .filter(Booking.public_id == payload.booking_public_id, Booking.user_id == user.id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    access_pass = ensure_access_pass_for_booking(db, booking)
    if not access_pass:
        raise HTTPException(status_code=400, detail="Booking is not eligible for an access pass")
    db.commit()
    db.refresh(access_pass)
    return AccessPassOut(**access_pass_to_out(access_pass, db))


@router.post("/access-passes/resolve", response_model=AccessPassResolveOut)
def resolve_access_pass(
    payload: AccessPassTokenIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    ctx = pass_context_for_token(db, payload.token)
    _scanner_authorize_context(db, user, ctx)
    return AccessPassResolveOut(**pass_context_to_resolve_out(ctx))


@router.post("/access-passes/public/resolve", response_model=AccessPassOut)
def resolve_public_access_pass(
    payload: AccessPassTokenIn,
    db: Session = Depends(get_db),
):
    ctx = pass_context_for_token(db, payload.token)
    if not ctx.access_pass:
        raise HTTPException(status_code=404, detail="Access pass not found")
    return AccessPassOut(**access_pass_to_out(ctx.access_pass, db))


@router.post("/access-passes/check-in", response_model=AccessPassResolveOut)
def check_in_access_pass(
    payload: AccessPassTokenIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    ctx = pass_context_for_token(db, payload.token)
    _scanner_authorize_context(db, user, ctx)
    result = mark_check_in(db, payload.token, user)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    if result.get("booking_public_id"):
        write_audit_log(
            db,
            actor_id=actor_id,
            action="access_pass_checked_in",
            entity_type="booking",
            entity_public_id=result["booking_public_id"],
            before_state=None,
            after_state={"pass_status": result.get("pass_status")},
            acting_as_user_id=acting_as_user_id,
            context=context,
        )
    return AccessPassResolveOut(**result)


@router.post("/access-passes/check-out", response_model=AccessPassResolveOut)
def check_out_access_pass(
    payload: AccessPassTokenIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    ctx = pass_context_for_token(db, payload.token)
    _scanner_authorize_context(db, user, ctx)
    result = mark_check_out(db, payload.token, user)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    if result.get("booking_public_id"):
        write_audit_log(
            db,
            actor_id=actor_id,
            action="access_pass_checked_out",
            entity_type="booking",
            entity_public_id=result["booking_public_id"],
            before_state=None,
            after_state={"pass_status": result.get("pass_status")},
            acting_as_user_id=acting_as_user_id,
            context=context,
        )
    return AccessPassResolveOut(**result)


@router.get("/attendance", response_model=AttendanceListOut)
def list_attendance(
    location_public_id: str | None = Query(None),
    date_filter: date | None = Query(None, alias="date"),
    space_type: str | None = Query(None),
    currently_in_office: bool = Query(False),
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    loc_ids = _attendance_location_ids(db, user, location_public_id)
    rows = _attendance_rows(
        db,
        location_ids=loc_ids,
        day=date_filter,
        space_type=space_type,
        currently_in_office=currently_in_office,
        status=status,
        search=search,
    )
    total = len(rows)
    start = (page - 1) * page_size
    results = [_serialize_attendance(*row) for row in rows[start : start + page_size]]
    return AttendanceListOut(results=results, total=total, page=page, page_size=page_size)


@router.get("/attendance/locations", response_model=list[AttendanceLocationOut])
def list_attendance_locations(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    loc_ids = _attendance_location_ids(db, user, None)
    if not loc_ids:
        return []
    locations = db.query(Location).filter(Location.id.in_(loc_ids)).order_by(Location.name.asc()).all()
    return [
        AttendanceLocationOut(location_public_id=location.public_id, location_name=location.name)
        for location in locations
    ]


@router.get("/attendance/current", response_model=list[AttendanceRecordOut])
def list_current_attendance(
    location_public_id: str | None = Query(None),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    loc_ids = _attendance_location_ids(db, user, location_public_id)
    rows = _attendance_rows(
        db,
        location_ids=loc_ids,
        day=None,
        space_type=None,
        currently_in_office=True,
        status=None,
        search=None,
    )
    return [_serialize_attendance(*row) for row in rows]


@router.get("/member/directory", response_model=list[MemberDirectoryItemOut])
def member_directory(
    days: int = Query(90, ge=1, le=365),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    if user.role != UserAppRole.MEMBER:
        raise HTTPException(status_code=403, detail="Member only")
    return [MemberDirectoryItemOut(**item) for item in directory_items_for_member(db, user, days=days)]
