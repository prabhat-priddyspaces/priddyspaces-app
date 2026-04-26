from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking_request import BookingRequest
from app.models.booking import Booking
from app.models.enums import BookingRequestStatus, BookingStatus, UserAppRole, UserRole
from app.models.location import Location
from datetime import datetime, timezone

from app.models.space import Space
from app.models.pricing_rule import PricingRule
from app.models.tax_config import TaxConfig
from app.models.feature_flag import FeatureFlag
from app.models.user import User
from app.schemas.booking_request import BookingRequestCreate, BookingRequestOut, BookingRequestDecision
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, require_location_roles
from app.services.availability import booking_overlaps, booking_request_overlaps, subscription_overlaps
from app.services.pricing import estimate_booking_amount
from app.services.notifications import send_email
from app.services.audit import write_audit_log
from app.services.platform_auth import get_audit_actor_context

router = APIRouter()


def _get_active_pricing_rule(db: Session, space_id: int) -> PricingRule | None:
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


def _instant_booking_enabled(db: Session, space: Space) -> bool:
    space_flag = db.query(FeatureFlag).filter(
        FeatureFlag.scope_type == "space",
        FeatureFlag.scope_id == space.id,
        FeatureFlag.flag_key == "instant_booking_enabled",
        FeatureFlag.flag_value.is_(True)
    ).first()
    if space_flag:
        return True
    tenant_flag = db.query(FeatureFlag).filter(
        FeatureFlag.scope_type == "tenant",
        FeatureFlag.scope_id == space.tenant_id,
        FeatureFlag.flag_key == "instant_booking_enabled",
        FeatureFlag.flag_value.is_(True)
    ).first()
    return tenant_flag is not None


def _to_out(
    req: BookingRequest,
    space: Space | None,
    booking: Booking | None = None,
    db: Session | None = None
) -> BookingRequestOut:
    price_daily = space.price_daily if space else None
    price_monthly = space.price_monthly if space else None
    estimated = None
    if space:
        rate_type = None
        rate_amount = None
        tax_rate = None
        if db:
            rule = _get_active_pricing_rule(db, space.id)
            if rule:
                rate_type = rule.rate_type
                rate_amount = rule.rate_amount
            tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
            if tax:
                tax_rate = tax.rate_percent
        estimated = estimate_booking_amount(
            req.start_datetime,
            req.end_datetime,
            price_daily,
            price_monthly,
            rate_type=rate_type,
            rate_amount=rate_amount,
            tax_rate_percent=tax_rate
        )
    return BookingRequestOut(
        public_id=req.public_id,
        space_id=req.space_id,
        space_public_id=space.public_id if space else None,
        user_id=req.user_id,
        booking_id=req.booking_id,
        booking_public_id=booking.public_id if booking else None,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        status=req.status,
        operator_notes=req.operator_notes,
        price_daily=price_daily,
        price_monthly=price_monthly,
        estimated_amount=estimated
    )


@router.post("/booking-requests", response_model=BookingRequestOut)
def create_booking_request(
    payload: BookingRequestCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    if subscription_overlaps(db, space.id, payload.start_datetime.date(), payload.end_datetime.date()):
        raise HTTPException(status_code=409, detail="Space already subscribed for that date")

    if booking_overlaps(db, space.id, payload.start_datetime, payload.end_datetime):
        raise HTTPException(status_code=409, detail="Booking overlaps existing booking")

    if booking_request_overlaps(db, space.id, payload.start_datetime, payload.end_datetime):
        raise HTTPException(status_code=409, detail="Booking request already exists for that time")

    instant = _instant_booking_enabled(db, space)
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=user.id,
        space_id=space.id,
        start_datetime=payload.start_datetime,
        end_datetime=payload.end_datetime,
        status=BookingRequestStatus.APPROVED if instant else BookingRequestStatus.REQUESTED
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    if instant:
        booking = Booking(
            user_id=req.user_id,
            space_id=req.space_id,
            tenant_id=req.tenant_id,
            start_datetime=req.start_datetime,
            end_datetime=req.end_datetime,
            status=BookingStatus.PENDING
        )
        db.add(booking)
        db.commit()
        db.refresh(booking)
        req.booking_id = booking.id
        db.add(req)
        db.commit()
        db.refresh(req)
        send_email(user.email, "Booking approved", f"Request {req.public_id} approved instantly.")
        return _to_out(req, space, booking, db)

    send_email(user.email, "Booking request submitted", f"Request {req.public_id} submitted.")
    return _to_out(req, space, None, db)


@router.get("/booking-requests", response_model=list[BookingRequestOut])
def list_booking_requests(
    status: BookingRequestStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(BookingRequest)

    if user.role == UserAppRole.CUSTOMER:
        query = query.filter(BookingRequest.user_id == user.id)
    else:
        location_ids = accessible_location_ids(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        if not location_ids:
            return []
        space_ids = [
            space_id
            for space_id, in db.query(Space.id).filter(Space.location_id.in_(location_ids)).all()
        ]
        if not space_ids:
            return []
        query = query.filter(BookingRequest.space_id.in_(space_ids))

    if status is not None:
        query = query.filter(BookingRequest.status == status)

    results: list[BookingRequestOut] = []
    for req in query.all():
        space = db.query(Space).filter(Space.id == req.space_id).first()
        booking = None
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        results.append(_to_out(req, space, booking, db))
    return results


@router.get("/booking-requests/{public_id}", response_model=BookingRequestOut)
def get_booking_request(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    if user.role == UserAppRole.CUSTOMER:
        if req.user_id != user.id:
            raise HTTPException(status_code=404, detail="Booking request not found")
        space = db.query(Space).filter(Space.id == req.space_id).first()
        booking = None
        if req.booking_id:
            booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
        return _to_out(req, space, booking, db)
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Booking request not found",
        status_code=404,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db)


@router.post("/booking-requests/{public_id}/approve", response_model=BookingRequestOut)
def approve_booking_request(
    public_id: str,
    payload: BookingRequestDecision,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    if req.status != BookingRequestStatus.REQUESTED:
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = BookingRequestStatus.APPROVED
    req.operator_notes = payload.operator_notes
    db.add(req)
    db.commit()
    db.refresh(req)

    booking = Booking(
        user_id=req.user_id,
        space_id=req.space_id,
        tenant_id=req.tenant_id,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        status=BookingStatus.PENDING
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    req.booking_id = booking.id
    db.add(req)
    db.commit()
    db.refresh(req)
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer:
        send_email(customer.email, "Booking request approved", f"Request {req.public_id} approved.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_request_approved",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state={"status": BookingRequestStatus.REQUESTED.value},
        after_state={"status": req.status.value},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db)


@router.post("/booking-requests/{public_id}/reject", response_model=BookingRequestOut)
def reject_booking_request(
    public_id: str,
    payload: BookingRequestDecision,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Booking request not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})

    if req.status != BookingRequestStatus.REQUESTED:
        raise HTTPException(status_code=400, detail="Request already processed")

    req.status = BookingRequestStatus.REJECTED
    req.operator_notes = payload.operator_notes
    db.add(req)
    db.commit()
    db.refresh(req)
    customer = db.query(User).filter(User.id == req.user_id).first()
    if customer:
        send_email(customer.email, "Booking request rejected", f"Request {req.public_id} rejected.")
    actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    write_audit_log(
        db,
        actor_id=actor_id,
        action="booking_request_rejected",
        entity_type="booking_request",
        entity_public_id=req.public_id,
        before_state={"status": BookingRequestStatus.REQUESTED.value},
        after_state={"status": req.status.value},
        acting_as_user_id=acting_as_user_id,
        context=context,
    )
    booking = None
    if req.booking_id:
        booking = db.query(Booking).filter(Booking.id == req.booking_id).first()
    return _to_out(req, space, booking, db)
