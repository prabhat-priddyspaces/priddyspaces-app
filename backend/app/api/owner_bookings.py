from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.booking_payment_link import BookingPaymentLink
from app.models.booking_request import BookingRequest
from app.models.enums import UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.user import User
from app.schemas.marketplace import SpaceAvailabilityOut
from app.schemas.owner_booking import (
    BookingPaymentLinkCardPointeCharge,
    BookingPaymentLinkChargeOut,
    BookingPaymentLinkPublicOut,
    BookingPaymentLinkStripeIntentOut,
    OwnerBookingCreate,
    OwnerBookingOut,
    OwnerBookingPreviewCreate,
    OwnerBookingPreviewOut,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import get_org_member, require_location_roles
from app.services.booking_inventory import expand_occurrences, validate_occurrences_available
from app.services.booking_products import validate_direct_booking_product
from app.services.owner_created_bookings import (
    PAYMENT_LINK_STATUS_CANCELLED,
    amount_cents_for_request,
    charge_cardpointe_link,
    create_booking_payment_link,
    create_owner_booking,
    create_stripe_intent_for_link,
    estimate_owner_booking_snapshot,
    latest_payment_link_for_request,
    payment_link_url,
    registration_url_for_request,
    resolve_payment_link,
    send_owner_created_booking_links,
)
from app.services.platform_auth import get_audit_actor_context
from app.services.space_availability import get_space_availability

router = APIRouter()


_GRANULARITY_MINUTES = {
    "30m": 30,
    "60m": 60,
    "120m": 120,
    "daily": 24 * 60,
}


def _serialize_time(value) -> str | None:
    return value.strftime("%H:%M") if value else None


def _aware_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _get_owner_space(db: Session, space_public_id: str, user: User) -> tuple[Space, Location, Organization]:
    row = (
        db.query(Space, Location, Organization)
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .filter(Space.public_id == space_public_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Space not found")
    space, location, organization = row
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    return space, location, organization


def _preview_from_snapshot(snapshot: dict) -> OwnerBookingPreviewOut:
    return OwnerBookingPreviewOut(
        base_amount_cents=int(snapshot.get("base_cents") or 0),
        discount_amount_cents=int(snapshot.get("discount_cents") or 0),
        tax_amount_cents=int(snapshot.get("tax_cents") or 0),
        total_amount_cents=int(snapshot.get("total_cents") or 0),
        original_total_amount_cents=snapshot.get("original_total_cents"),
        override_applied=bool(snapshot.get("override_reason")),
        rate_basis=snapshot.get("rate_basis"),
        units=snapshot.get("units"),
        quantity=int(snapshot.get("quantity") or 1),
    )


def _member_name(user: User) -> str | None:
    return user.full_name or " ".join(part for part in [user.first_name, user.last_name] if part).strip() or None


def _owner_booking_out(
    *,
    req: BookingRequest,
    member: User,
    booking: Booking | None,
    link: BookingPaymentLink | None,
    token: str | None,
) -> OwnerBookingOut:
    return OwnerBookingOut(
        request_public_id=req.public_id,
        booking_public_id=booking.public_id if booking else None,
        status=getattr(req.status, "value", req.status),
        payment_status=req.payment_status,
        payment_collection_mode=req.payment_collection_mode or "",
        member_public_id=member.public_id,
        member_email=member.email,
        member_name=_member_name(member),
        total_amount_cents=amount_cents_for_request(req),
        payment_link_url=payment_link_url(token) if token else None,
        payment_link_expires_at=link.expires_at if link else None,
        registration_url=registration_url_for_request(req, member),
    )


@router.get("/owner/spaces/{space_public_id}/availability", response_model=SpaceAvailabilityOut)
def owner_space_availability(
    space_public_id: str,
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    space, location, _organization = _get_owner_space(db, space_public_id, user)
    try:
        start_date = date.fromisoformat(from_date)
        end_date = date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format; expected YYYY-MM-DD")
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")
    if (end_date - start_date).days > 120:
        raise HTTPException(status_code=400, detail="Date range too large; max 120 days")
    days = get_space_availability(
        db,
        space_id=space.id,
        location_timezone=location.timezone,
        start_date=start_date,
        end_date=end_date,
        availability_start_time=space.availability_start_time,
        availability_end_time=space.availability_end_time,
        space_type=getattr(space.space_type, "value", space.space_type),
        space_capacity=space.capacity,
    )
    raw_granularity = getattr(location.booking_granularity, "value", location.booking_granularity)
    return SpaceAvailabilityOut(
        space_public_id=space.public_id,
        timezone=location.timezone,
        granularity_minutes=_GRANULARITY_MINUTES.get(raw_granularity),
        availability_start_time=_serialize_time(space.availability_start_time),
        availability_end_time=_serialize_time(space.availability_end_time),
        buffer_before_minutes=space.buffer_before_minutes or 0,
        buffer_after_minutes=space.buffer_after_minutes or 0,
        hourly_price=space.price_hourly,
        daily_price=space.price_daily,
        days=days,
    )


@router.post("/owner/bookings/preview", response_model=OwnerBookingPreviewOut)
def preview_owner_booking(
    payload: OwnerBookingPreviewCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    space, location, organization = _get_owner_space(db, payload.space_public_id, user)
    member = get_org_member(db, organization.id, user.id)
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
    validate_occurrences_available(
        db,
        space=space,
        location=location,
        occurrences=occurrences,
        booking_mode=payload.booking_mode,
        full_day=payload.full_day,
        seats_requested=payload.seats_requested,
    )
    snapshot = estimate_owner_booking_snapshot(
        db,
        space=space,
        location=location,
        actor_member=member,
        payload=payload,
    )
    return _preview_from_snapshot(snapshot)


@router.post("/owner/bookings", response_model=OwnerBookingOut)
def create_owner_booking_endpoint(
    payload: OwnerBookingCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    space, location, organization = _get_owner_space(db, payload.space_public_id, user)
    locked = db.query(Space).filter(Space.id == space.id).with_for_update().first()
    if locked:
        space = locked
    actor_member = get_org_member(db, organization.id, user.id)
    _actor_id, acting_as_user_id, context = get_audit_actor_context(db, token)
    req, booking, _payment, link, link_token, member = create_owner_booking(
        db,
        actor=user,
        actor_member=actor_member,
        organization=organization,
        location=location,
        space=space,
        payload=payload,
        audit_context=context,
        acting_as_user_id=acting_as_user_id,
    )
    return _owner_booking_out(req=req, member=member, booking=booking, link=link, token=link_token)


@router.post("/owner/bookings/{request_public_id}/resend-links", response_model=OwnerBookingOut)
def resend_owner_booking_links(
    request_public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    req = db.query(BookingRequest).filter(BookingRequest.public_id == request_public_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found")
    space = db.query(Space).filter(Space.id == req.space_id).first()
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    organization = db.query(Organization).filter(Organization.id == req.tenant_id).first()
    member = db.query(User).filter(User.id == req.user_id).first() if req.user_id else None
    if not space or not location or not organization or not member:
        raise HTTPException(status_code=404, detail="Booking request not found")
    require_location_roles(db, user.id, location, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if req.source != "owner_created" or req.payment_collection_mode != "payment_link":
        raise HTTPException(status_code=400, detail="Booking does not have a payment link")
    if req.status != "requested" and getattr(req.status, "value", req.status) != "requested":
        raise HTTPException(status_code=400, detail="Booking is no longer payable")
    if not req.payment_hold_expires_at or _aware_utc(req.payment_hold_expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Payment hold has expired")
    existing = latest_payment_link_for_request(db, req)
    if existing and existing.status == "sent":
        existing.status = PAYMENT_LINK_STATUS_CANCELLED
        db.add(existing)
    link, link_token = create_booking_payment_link(
        db,
        req=req,
        actor_id=user.id,
        recipient_email=member.email,
        expires_at=req.payment_hold_expires_at,
    )
    send_owner_created_booking_links(
        db,
        req=req,
        member=member,
        space=space,
        location=location,
        link=link,
        token=link_token,
    )
    db.commit()
    db.refresh(link)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    return _owner_booking_out(req=req, member=member, booking=booking, link=link, token=link_token)


@router.get("/booking-payment-links/{link_token}", response_model=BookingPaymentLinkPublicOut)
def get_booking_payment_link(
    link_token: str,
    db: Session = Depends(get_db),
):
    link, req, member, space, location, _organization, setting = resolve_payment_link(db, link_token)
    booking = db.query(Booking).filter(Booking.id == req.booking_id).first() if req.booking_id else None
    return BookingPaymentLinkPublicOut(
        public_id=link.public_id,
        status=link.status,
        expires_at=link.expires_at,
        request_public_id=req.public_id,
        booking_public_id=booking.public_id if booking else None,
        space_name=space.name,
        location_name=location.name,
        start_datetime=req.start_datetime,
        end_datetime=req.end_datetime,
        member_email=member.email,
        member_name=_member_name(member),
        amount_cents=amount_cents_for_request(req),
        provider=setting.provider,
        publishable_key=setting.stripe_publishable_key if setting.provider == "stripe" else None,
        tokenizer_url=setting.cardpointe_tokenizer_url if setting.provider == "cardpointe" else None,
    )


@router.post("/booking-payment-links/{link_token}/stripe-intent", response_model=BookingPaymentLinkStripeIntentOut)
def create_booking_link_stripe_intent(
    link_token: str,
    db: Session = Depends(get_db),
):
    client_secret, payment_intent_id, publishable_key = create_stripe_intent_for_link(db, link_token)
    return BookingPaymentLinkStripeIntentOut(
        client_secret=client_secret,
        payment_intent_id=payment_intent_id,
        publishable_key=publishable_key,
    )


@router.post("/booking-payment-links/{link_token}/cardpointe-charge", response_model=BookingPaymentLinkChargeOut)
def charge_booking_link_cardpointe(
    link_token: str,
    payload: BookingPaymentLinkCardPointeCharge,
    db: Session = Depends(get_db),
):
    req, booking, payment = charge_cardpointe_link(db, link_token, payload.model_dump())
    return BookingPaymentLinkChargeOut(
        status="succeeded",
        request_public_id=req.public_id,
        booking_public_id=booking.public_id if booking else None,
        payment_public_id=payment.public_id if payment else None,
    )
