from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.enums import BookingStatus, UserAppRole, UserRole
from app.models.location import Location
from app.models.space import Space
from app.schemas.booking import BookingCreate, BookingOut, BookingUpdateIn, BookingCancelOut, BookingCheckInOut
from app.models.cancellation_policy import CancellationPolicy
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, require_location_roles
from app.services.availability import booking_overlaps, subscription_overlaps
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context
from app.services.notifications import send_email
from app.models.user import User

router = APIRouter()


def _booking_for_checkin(db: Session, public_id: str, token: dict) -> tuple[Booking, User, Location, Space]:
    user = get_or_create_user(db, token)
    booking = db.query(Booking).filter(Booking.public_id == public_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user.role == UserAppRole.CUSTOMER:
        if booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking not found")
    else:
        require_location_roles(
            db,
            user.id,
            location,
            {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
            detail="Booking not found",
            status_code=404,
        )
    return booking, user, location, space


@router.post("/bookings", response_model=BookingOut)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    raise HTTPException(status_code=409, detail="Use booking requests")
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    if subscription_overlaps(db, space.id, payload.start_datetime.date(), payload.end_datetime.date()):
        raise HTTPException(status_code=409, detail="Space already subscribed for that date")

    if booking_overlaps(db, space.id, payload.start_datetime, payload.end_datetime):
        raise HTTPException(status_code=409, detail="Booking overlaps existing booking")

    booking = Booking(
        user_id=user.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        status=BookingStatus.PENDING
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(
    status: BookingStatus | None = None,
    location_public_id: str | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(Booking)

    if user.role == UserAppRole.CUSTOMER:
        query = query.filter(Booking.user_id == user.id)
    else:
        loc_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        if not loc_ids:
            return []
        space_ids = [
            s.id for s in db.query(Space).filter(Space.location_id.in_(loc_ids)).all()
        ]
        if not space_ids:
            return []
        query = query.filter(Booking.space_id.in_(space_ids))
        if location_public_id:
            loc = db.query(Location).filter(Location.public_id == location_public_id).first()
            if not loc or loc.id not in loc_ids:
                return []
            space_ids_loc = [s.id for s in db.query(Space).filter(Space.location_id == loc.id).all()]
            query = query.filter(Booking.space_id.in_(space_ids_loc))
    if status is not None:
        query = query.filter(Booking.status == status)
    return query.all()


@router.get("/bookings/{public_id}", response_model=BookingOut)
def get_booking(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    booking = db.query(Booking).filter(Booking.public_id == public_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user.role == UserAppRole.CUSTOMER and booking.user_id != user.id:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user.role != UserAppRole.CUSTOMER:
        space = db.query(Space).filter(Space.id == booking.space_id).first()
        if space:
            location = db.query(Location).filter(Location.id == space.location_id).first()
            if location:
                require_location_roles(
                    db,
                    user.id,
                    location,
                    {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
                    detail="Booking not found",
                    status_code=404,
                )
    return booking


@router.patch("/bookings/{public_id}", response_model=BookingOut)
def update_booking(
    public_id: str,
    payload: BookingUpdateIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    booking = db.query(Booking).filter(Booking.public_id == public_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if payload.status not in (BookingStatus.CONFIRMED, BookingStatus.CANCELED):
        raise HTTPException(status_code=400, detail="Status must be confirmed or canceled")

    if user.role == UserAppRole.CUSTOMER:
        if booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking not found")
        if payload.status != BookingStatus.CANCELED:
            raise HTTPException(status_code=403, detail="Customers can only cancel their own booking")
    else:
        space = db.query(Space).filter(Space.id == booking.space_id).first()
        if not space:
            raise HTTPException(status_code=404, detail="Booking not found")
        location = db.query(Location).filter(Location.id == space.location_id).first()
        if not location:
            raise HTTPException(status_code=404, detail="Booking not found")
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    booking.status = payload.status
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@router.post("/bookings/{public_id}/cancel", response_model=BookingCancelOut)
def cancel_booking(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    booking = db.query(Booking).filter(Booking.public_id == public_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking not found")

    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking not found")

    if user.role == UserAppRole.CUSTOMER:
        if booking.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking not found")
    else:
        require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    policy = (
        db.query(CancellationPolicy)
        .filter(
            CancellationPolicy.tenant_id == location.organization_id,
            CancellationPolicy.space_type == space.space_type
        )
        .first()
    )
    refund_percent = policy.refund_percent if policy else 0

    before_status = booking.status
    booking.status = BookingStatus.CANCELED
    db.add(booking)
    db.commit()
    db.refresh(booking)
    customer = db.query(User).filter(User.id == booking.user_id).first()
    if customer:
        send_email(customer.email, "Booking canceled", f"Booking {booking.public_id} has been canceled.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_canceled",
        entity_type="booking",
        entity_public_id=booking.public_id,
        before_state={"status": before_status.value},
        after_state={"status": booking.status.value, "refund_percent": refund_percent},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return BookingCancelOut(public_id=booking.public_id, status=booking.status, refund_percent=refund_percent)


@router.post("/bookings/{public_id}/check-in", response_model=BookingCheckInOut)
def check_in_booking(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    booking, _user, _location, _space = _booking_for_checkin(db, public_id, token)
    if booking.status != BookingStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="Booking must be confirmed to check in")
    if booking.checked_in_at is not None:
        return BookingCheckInOut(
            public_id=booking.public_id,
            checked_in_at=booking.checked_in_at,
            checked_out_at=booking.checked_out_at,
        )
    booking.checked_in_at = datetime.now(timezone.utc)
    booking.no_show = False
    db.add(booking)
    db.commit()
    db.refresh(booking)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_checked_in",
        entity_type="booking",
        entity_public_id=booking.public_id,
        before_state=None,
        after_state={"checked_in_at": booking.checked_in_at.isoformat()},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return BookingCheckInOut(
        public_id=booking.public_id,
        checked_in_at=booking.checked_in_at,
        checked_out_at=booking.checked_out_at,
    )


@router.post("/bookings/{public_id}/check-out", response_model=BookingCheckInOut)
def check_out_booking(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    booking, _user, _location, _space = _booking_for_checkin(db, public_id, token)
    if booking.checked_in_at is None:
        raise HTTPException(status_code=400, detail="Booking must be checked in before check-out")
    if booking.checked_out_at is not None:
        return BookingCheckInOut(
            public_id=booking.public_id,
            checked_in_at=booking.checked_in_at,
            checked_out_at=booking.checked_out_at,
        )
    booking.checked_out_at = datetime.now(timezone.utc)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_checked_out",
        entity_type="booking",
        entity_public_id=booking.public_id,
        before_state=None,
        after_state={"checked_out_at": booking.checked_out_at.isoformat()},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return BookingCheckInOut(
        public_id=booking.public_id,
        checked_in_at=booking.checked_in_at,
        checked_out_at=booking.checked_out_at,
    )


@router.post("/bookings/{public_id}/refund", response_model=BookingCancelOut)
def refund_booking(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    booking = db.query(Booking).filter(Booking.public_id == public_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking not found")

    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN})

    policy = (
        db.query(CancellationPolicy)
        .filter(
            CancellationPolicy.tenant_id == location.organization_id,
            CancellationPolicy.space_type == space.space_type
        )
        .first()
    )
    refund_percent = policy.refund_percent if policy else 0

    before_status = booking.status
    booking.status = BookingStatus.CANCELED
    db.add(booking)
    db.commit()
    db.refresh(booking)
    customer = db.query(User).filter(User.id == booking.user_id).first()
    if customer:
        send_email(customer.email, "Booking refunded", f"Booking {booking.public_id} refund initiated.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_refund_requested",
        entity_type="booking",
        entity_public_id=booking.public_id,
        before_state={"status": before_status.value},
        after_state={"status": booking.status.value, "refund_percent": refund_percent},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    return BookingCancelOut(public_id=booking.public_id, status=booking.status, refund_percent=refund_percent)
