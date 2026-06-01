from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, quote, unquote, urlparse

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import BookingRequestStatus, BookingStatus, PaymentStatus, UserAppRole
from app.models.location import Location
from app.models.payment import Payment
from app.models.space import Space
from app.models.space_access_pass import SpaceAccessPass
from app.models.space_attendance_record import SpaceAttendanceRecord
from app.models.subscription import Subscription
from app.models.user import User
from app.services.email_identity import get_user_by_normalized_email, normalize_email

ACTIVE_PASS_STATUS = "active"
REVOKED_PASS_STATUS = "revoked"
CHECK_IN = "check_in"
CHECK_OUT = "check_out"


@dataclass
class PassContext:
    access_pass: SpaceAccessPass | None
    booking: Booking | None
    booking_request: BookingRequest | None
    member: User | None
    location: Location | None
    space: Space | None
    pass_status: str
    message: str | None = None


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def token_hash(token: str) -> str:
    key = (settings.JWT_SECRET or "priddyspaces-local-access-pass-token-key").encode("utf-8")
    return hmac.new(key, token.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_access_token() -> str:
    return secrets.token_urlsafe(32)


def access_pass_url(token: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/guest/access-pass#{quote(token)}"


def extract_token(raw: str) -> str:
    candidate = (raw or "").strip()
    if not candidate:
        return ""
    parsed = urlparse(candidate)
    if parsed.fragment:
        fragment = parsed.fragment
        if "=" in fragment:
            params = parse_qs(fragment)
            token = params.get("token", [""])[0]
            return unquote(token).strip()
        return unquote(fragment).strip()
    if parsed.query:
        params = parse_qs(parsed.query)
        token = params.get("token", [""])[0]
        if token:
            return unquote(token).strip()
    return candidate


def qr_png_base64(token: str) -> str | None:
    try:
        import qrcode
        from io import BytesIO
    except Exception:
        return None
    image = qrcode.make(access_pass_url(token))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _display_name(user: User | None, req: BookingRequest | None = None) -> str | None:
    if req and req.is_guest_checkout and req.guest_full_name:
        return req.guest_full_name
    if not user:
        return None
    parts = [user.first_name or "", user.last_name or ""]
    return user.full_name or " ".join(part for part in parts if part).strip() or user.email


def _space_name(space: Space | None) -> str | None:
    if not space:
        return None
    return space.name or getattr(space.space_type, "value", str(space.space_type)).replace("_", " ").title()


def _booking_request_for_booking(db: Session, booking: Booking) -> BookingRequest | None:
    if booking.booking_request_id:
        return db.query(BookingRequest).filter(BookingRequest.id == booking.booking_request_id).first()
    return db.query(BookingRequest).filter(BookingRequest.booking_id == booking.id).first()


def _guest_user_for_request(db: Session, req: BookingRequest | None) -> User | None:
    if not req or not req.is_guest_checkout or not req.guest_email:
        return None
    normalized_email = normalize_email(req.guest_email)
    user = get_user_by_normalized_email(db, normalized_email)
    if user:
        return user
    user = User(
        email=normalized_email,
        full_name=req.guest_full_name,
        role=UserAppRole.MEMBER,
        is_active=True,
        email_verified=False,
        phone=req.guest_phone,
        company_name=req.guest_company_name,
    )
    db.add(user)
    db.flush()
    return user


def ensure_guest_user_for_request(db: Session, req: BookingRequest) -> User | None:
    return _guest_user_for_request(db, req)


def claim_guest_bookings_for_user(db: Session, user: User) -> int:
    if not user.email:
        return 0
    email = normalize_email(user.email)
    requests = (
        db.query(BookingRequest)
        .filter(
            BookingRequest.is_guest_checkout.is_(True),
            func.lower(BookingRequest.guest_email) == email,
            or_(BookingRequest.user_id.is_(None), BookingRequest.user_id == user.id),
        )
        .all()
    )
    claimed = 0
    for req in requests:
        if req.user_id != user.id:
            req.user_id = user.id
            db.add(req)
            claimed += 1
        bookings = db.query(Booking).filter(Booking.booking_request_id == req.id).all()
        if req.booking_id:
            direct = db.query(Booking).filter(Booking.id == req.booking_id).first()
            if direct:
                bookings.append(direct)
        seen: set[int] = set()
        for booking in bookings:
            if booking.id in seen:
                continue
            seen.add(booking.id)
            if booking.user_id != user.id:
                booking.user_id = user.id
                db.add(booking)
                claimed += 1
            if booking.status == BookingStatus.CONFIRMED:
                ensure_access_pass_for_booking(db, booking, req=req)
    return claimed


def _latest_payment_invalidates_access(db: Session, booking: Booking, req: BookingRequest | None) -> bool:
    filters = [Payment.booking_id == booking.id]
    if req:
        filters.append(Payment.booking_request_id == req.id)
    payment = db.query(Payment).filter(or_(*filters)).order_by(Payment.created_at.desc()).first()
    return bool(payment and payment.status in {PaymentStatus.REFUNDED, PaymentStatus.VOIDED})


def ensure_access_pass_for_booking(
    db: Session,
    booking: Booking,
    *,
    req: BookingRequest | None = None,
) -> SpaceAccessPass | None:
    if booking.status != BookingStatus.CONFIRMED:
        return None
    req = req or _booking_request_for_booking(db, booking)
    space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space:
        return None
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        return None
    if req and req.user_id is None:
        guest_user = _guest_user_for_request(db, req)
        if guest_user:
            req.user_id = guest_user.id
            booking.user_id = guest_user.id
            db.add(req)
            db.add(booking)
    if booking.user_id is None:
        return None
    access_pass = (
        db.query(SpaceAccessPass)
        .filter(SpaceAccessPass.booking_id == booking.id)
        .first()
    )
    if access_pass and access_pass.status == ACTIVE_PASS_STATUS:
        access_pass.user_id = booking.user_id
        access_pass.booking_request_id = req.id if req else access_pass.booking_request_id
        access_pass.location_id = location.id
        access_pass.space_id = space.id
        access_pass.tenant_id = booking.tenant_id
        access_pass.valid_from_at = booking.start_datetime
        access_pass.expires_at = booking.end_datetime
        db.add(access_pass)
        db.flush()
        return access_pass

    token = generate_access_token()
    if access_pass:
        access_pass.token_hash = token_hash(token)
        access_pass.token_encrypted = encrypt_secret(token) or token
        access_pass.status = ACTIVE_PASS_STATUS
        access_pass.revoked_at = None
        access_pass.revoked_reason = None
    else:
        access_pass = SpaceAccessPass(
            tenant_id=booking.tenant_id,
            booking_id=booking.id,
            booking_request_id=req.id if req else None,
            location_id=location.id,
            space_id=space.id,
            user_id=booking.user_id,
            token_hash=token_hash(token),
            token_encrypted=encrypt_secret(token) or token,
            valid_from_at=booking.start_datetime,
            expires_at=booking.end_datetime,
            status=ACTIVE_PASS_STATUS,
        )
    db.add(access_pass)
    db.flush()
    return access_pass


def ensure_access_passes_for_booking_request(db: Session, req: BookingRequest) -> list[SpaceAccessPass]:
    bookings = db.query(Booking).filter(Booking.booking_request_id == req.id).all()
    if req.booking_id:
        direct = db.query(Booking).filter(Booking.id == req.booking_id).first()
        if direct:
            bookings.append(direct)
    out: list[SpaceAccessPass] = []
    seen: set[int] = set()
    for booking in bookings:
        if booking.id in seen:
            continue
        seen.add(booking.id)
        access_pass = ensure_access_pass_for_booking(db, booking, req=req)
        if access_pass:
            out.append(access_pass)
    return out


def revoke_access_passes_for_booking(db: Session, booking: Booking, *, reason: str) -> None:
    rows = db.query(SpaceAccessPass).filter(SpaceAccessPass.booking_id == booking.id).all()
    now = now_utc()
    for access_pass in rows:
        if access_pass.status != REVOKED_PASS_STATUS:
            access_pass.status = REVOKED_PASS_STATUS
            access_pass.revoked_at = now
            access_pass.revoked_reason = reason
            db.add(access_pass)


def revoke_access_passes_for_request(db: Session, req: BookingRequest, *, reason: str) -> None:
    rows = db.query(SpaceAccessPass).filter(SpaceAccessPass.booking_request_id == req.id).all()
    if req.booking_id:
        rows.extend(db.query(SpaceAccessPass).filter(SpaceAccessPass.booking_id == req.booking_id).all())
    now = now_utc()
    seen: set[int] = set()
    for access_pass in rows:
        if access_pass.id in seen:
            continue
        seen.add(access_pass.id)
        access_pass.status = REVOKED_PASS_STATUS
        access_pass.revoked_at = access_pass.revoked_at or now
        access_pass.revoked_reason = reason
        db.add(access_pass)


def decrypted_token(access_pass: SpaceAccessPass) -> str:
    return decrypt_secret(access_pass.token_encrypted) or access_pass.token_encrypted


def pass_context_for_token(db: Session, raw_token: str) -> PassContext:
    token = extract_token(raw_token)
    if not token:
        return PassContext(None, None, None, None, None, None, "invalid", "Invalid QR token")
    access_pass = (
        db.query(SpaceAccessPass)
        .filter(SpaceAccessPass.token_hash == token_hash(token))
        .first()
    )
    if not access_pass:
        return PassContext(None, None, None, None, None, None, "invalid", "Access pass not found")
    booking = db.query(Booking).filter(Booking.id == access_pass.booking_id).first()
    booking_request = (
        db.query(BookingRequest).filter(BookingRequest.id == access_pass.booking_request_id).first()
        if access_pass.booking_request_id
        else None
    )
    member = db.query(User).filter(User.id == access_pass.user_id).first()
    location = db.query(Location).filter(Location.id == access_pass.location_id).first()
    space = db.query(Space).filter(Space.id == access_pass.space_id).first()
    status = resolve_pass_status(db, access_pass, booking, booking_request)
    return PassContext(access_pass, booking, booking_request, member, location, space, status)


def resolve_pass_status(
    db: Session,
    access_pass: SpaceAccessPass,
    booking: Booking | None,
    req: BookingRequest | None,
) -> str:
    if not booking:
        return "invalid"
    if access_pass.status != ACTIVE_PASS_STATUS:
        return "cancelled"
    if booking.status != BookingStatus.CONFIRMED:
        return "cancelled"
    if req and req.status in {BookingRequestStatus.CANCELLED, BookingRequestStatus.REJECTED}:
        return "cancelled"
    if _latest_payment_invalidates_access(db, booking, req):
        return "cancelled"
    now = now_utc()
    valid_from = as_utc(access_pass.valid_from_at or booking.start_datetime)
    expires_at = as_utc(access_pass.expires_at or booking.end_datetime)
    if now < valid_from:
        return "not_yet_valid"
    if now > expires_at:
        return "expired"
    if booking.checked_out_at is not None:
        return "checked_out"
    if booking.checked_in_at is not None:
        return "already_checked_in"
    return "valid"


def access_pass_to_out(access_pass: SpaceAccessPass, db: Session) -> dict:
    booking = db.query(Booking).filter(Booking.id == access_pass.booking_id).first()
    req = (
        db.query(BookingRequest).filter(BookingRequest.id == access_pass.booking_request_id).first()
        if access_pass.booking_request_id
        else None
    )
    member = db.query(User).filter(User.id == access_pass.user_id).first()
    location = db.query(Location).filter(Location.id == access_pass.location_id).first()
    space = db.query(Space).filter(Space.id == access_pass.space_id).first()
    if not booking or not location or not space:
        raise HTTPException(status_code=404, detail="Access pass not found")
    token = decrypted_token(access_pass)
    return {
        "public_id": access_pass.public_id,
        "booking_public_id": booking.public_id,
        "booking_request_public_id": req.public_id if req else None,
        "qr_payload": access_pass_url(token),
        "status": access_pass.status,
        "pass_status": resolve_pass_status(db, access_pass, booking, req),
        "valid_from_at": access_pass.valid_from_at,
        "expires_at": access_pass.expires_at,
        "checked_in_at": booking.checked_in_at,
        "checked_out_at": booking.checked_out_at,
        "member_name": _display_name(member, req),
        "member_email": member.email if member else req.guest_email if req else None,
        "location_public_id": location.public_id,
        "location_name": location.name,
        "space_public_id": space.public_id,
        "space_name": _space_name(space),
        "space_type": getattr(space.space_type, "value", space.space_type),
        "start_datetime": booking.start_datetime,
        "end_datetime": booking.end_datetime,
    }


def pass_context_to_resolve_out(ctx: PassContext) -> dict:
    booking = ctx.booking
    access_pass = ctx.access_pass
    req = ctx.booking_request
    member = ctx.member
    location = ctx.location
    space = ctx.space
    return {
        "public_id": access_pass.public_id if access_pass else None,
        "booking_public_id": booking.public_id if booking else None,
        "booking_request_public_id": req.public_id if req else None,
        "member_name": _display_name(member, req),
        "member_email": member.email if member else req.guest_email if req else None,
        "location_public_id": location.public_id if location else None,
        "location_name": location.name if location else None,
        "space_public_id": space.public_id if space else None,
        "space_name": _space_name(space),
        "space_type": getattr(space.space_type, "value", space.space_type) if space else None,
        "start_datetime": booking.start_datetime if booking else None,
        "end_datetime": booking.end_datetime if booking else None,
        "checked_in_at": booking.checked_in_at if booking else None,
        "checked_out_at": booking.checked_out_at if booking else None,
        "pass_status": ctx.pass_status,
        "can_check_in": ctx.pass_status == "valid",
        "can_check_out": ctx.pass_status == "already_checked_in",
        "message": ctx.message,
    }


def mark_check_in(db: Session, raw_token: str, scanner: User) -> dict:
    ctx = pass_context_for_token(db, raw_token)
    if ctx.pass_status == "already_checked_in":
        raise HTTPException(status_code=409, detail="Already checked in")
    if ctx.pass_status != "valid":
        raise HTTPException(status_code=400, detail=f"Pass is {ctx.pass_status}")
    if not ctx.access_pass or not ctx.booking:
        raise HTTPException(status_code=400, detail="Invalid pass")
    event_at = now_utc()
    ctx.booking.checked_in_at = event_at
    ctx.booking.no_show = False
    ctx.access_pass.last_used_at = event_at
    db.add(ctx.booking)
    db.add(ctx.access_pass)
    db.add(
        SpaceAttendanceRecord(
            tenant_id=ctx.access_pass.tenant_id,
            access_pass_id=ctx.access_pass.id,
            booking_id=ctx.booking.id,
            location_id=ctx.access_pass.location_id,
            space_id=ctx.access_pass.space_id,
            member_id=ctx.access_pass.user_id,
            scanned_by_user_id=scanner.id,
            event_type=CHECK_IN,
            status="checked_in",
            event_at=event_at,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already checked in") from exc
    db.refresh(ctx.booking)
    ctx.pass_status = "already_checked_in"
    return pass_context_to_resolve_out(ctx)


def _attendance_event_exists(db: Session, booking_id: int, event_type: str) -> bool:
    return (
        db.query(SpaceAttendanceRecord.id)
        .filter(
            SpaceAttendanceRecord.booking_id == booking_id,
            SpaceAttendanceRecord.event_type == event_type,
        )
        .first()
        is not None
    )


def mark_booking_check_in(db: Session, booking: Booking, scanner: User) -> Booking:
    access_pass = ensure_access_pass_for_booking(db, booking)
    if not access_pass:
        raise HTTPException(status_code=400, detail="Booking is not eligible for an access pass")
    req = _booking_request_for_booking(db, booking)
    status = resolve_pass_status(db, access_pass, booking, req)
    if status == "already_checked_in":
        if not _attendance_event_exists(db, booking.id, CHECK_IN):
            db.add(
                SpaceAttendanceRecord(
                    tenant_id=access_pass.tenant_id,
                    access_pass_id=access_pass.id,
                    booking_id=booking.id,
                    location_id=access_pass.location_id,
                    space_id=access_pass.space_id,
                    member_id=access_pass.user_id,
                    scanned_by_user_id=scanner.id,
                    event_type=CHECK_IN,
                    status="checked_in",
                    event_at=booking.checked_in_at or now_utc(),
                )
            )
            db.commit()
            db.refresh(booking)
        return booking
    if status != "valid":
        raise HTTPException(status_code=400, detail=f"Pass is {status}")
    event_at = now_utc()
    booking.checked_in_at = event_at
    booking.no_show = False
    access_pass.last_used_at = event_at
    db.add(booking)
    db.add(access_pass)
    db.add(
        SpaceAttendanceRecord(
            tenant_id=access_pass.tenant_id,
            access_pass_id=access_pass.id,
            booking_id=booking.id,
            location_id=access_pass.location_id,
            space_id=access_pass.space_id,
            member_id=access_pass.user_id,
            scanned_by_user_id=scanner.id,
            event_type=CHECK_IN,
            status="checked_in",
            event_at=event_at,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already checked in") from exc
    db.refresh(booking)
    return booking


def mark_check_out(db: Session, raw_token: str, scanner: User) -> dict:
    ctx = pass_context_for_token(db, raw_token)
    if ctx.pass_status == "checked_out":
        raise HTTPException(status_code=409, detail="Already checked out")
    if not ctx.booking or not ctx.access_pass or ctx.booking.checked_in_at is None:
        raise HTTPException(status_code=400, detail="Booking must be checked in before check-out")
    if ctx.pass_status not in {"already_checked_in", "expired"} and ctx.booking.checked_out_at is None:
        raise HTTPException(status_code=400, detail=f"Pass is {ctx.pass_status}")
    event_at = now_utc()
    ctx.booking.checked_out_at = event_at
    ctx.access_pass.last_used_at = event_at
    db.add(ctx.booking)
    db.add(ctx.access_pass)
    db.add(
        SpaceAttendanceRecord(
            tenant_id=ctx.access_pass.tenant_id,
            access_pass_id=ctx.access_pass.id,
            booking_id=ctx.booking.id,
            location_id=ctx.access_pass.location_id,
            space_id=ctx.access_pass.space_id,
            member_id=ctx.access_pass.user_id,
            scanned_by_user_id=scanner.id,
            event_type=CHECK_OUT,
            status="checked_out",
            event_at=event_at,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already checked out") from exc
    db.refresh(ctx.booking)
    ctx.pass_status = "checked_out"
    return pass_context_to_resolve_out(ctx)


def mark_booking_check_out(db: Session, booking: Booking, scanner: User) -> Booking:
    access_pass = ensure_access_pass_for_booking(db, booking)
    if not access_pass:
        raise HTTPException(status_code=400, detail="Booking is not eligible for an access pass")
    req = _booking_request_for_booking(db, booking)
    status = resolve_pass_status(db, access_pass, booking, req)
    if status == "checked_out":
        if not _attendance_event_exists(db, booking.id, CHECK_OUT):
            db.add(
                SpaceAttendanceRecord(
                    tenant_id=access_pass.tenant_id,
                    access_pass_id=access_pass.id,
                    booking_id=booking.id,
                    location_id=access_pass.location_id,
                    space_id=access_pass.space_id,
                    member_id=access_pass.user_id,
                    scanned_by_user_id=scanner.id,
                    event_type=CHECK_OUT,
                    status="checked_out",
                    event_at=booking.checked_out_at or now_utc(),
                )
            )
            db.commit()
            db.refresh(booking)
        return booking
    if booking.checked_in_at is None:
        raise HTTPException(status_code=400, detail="Booking must be checked in before check-out")
    if status not in {"already_checked_in", "expired"}:
        raise HTTPException(status_code=400, detail=f"Pass is {status}")
    event_at = now_utc()
    booking.checked_out_at = event_at
    access_pass.last_used_at = event_at
    db.add(booking)
    db.add(access_pass)
    db.add(
        SpaceAttendanceRecord(
            tenant_id=access_pass.tenant_id,
            access_pass_id=access_pass.id,
            booking_id=booking.id,
            location_id=access_pass.location_id,
            space_id=access_pass.space_id,
            member_id=access_pass.user_id,
            scanned_by_user_id=scanner.id,
            event_type=CHECK_OUT,
            status="checked_out",
            event_at=event_at,
        )
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Already checked out") from exc
    db.refresh(booking)
    return booking


def recent_member_location_ids(db: Session, user_id: int) -> set[int]:
    space_ids = {sid for sid, in db.query(Booking.space_id).filter(Booking.user_id == user_id).distinct()}
    space_ids.update(sid for sid, in db.query(Subscription.space_id).filter(Subscription.user_id == user_id).distinct())
    if not space_ids:
        return set()
    return {lid for lid, in db.query(Space.location_id).filter(Space.id.in_(space_ids)).distinct()}


def _current_presence_by_member_location(db: Session, location_ids: set[int]) -> dict[tuple[int, int], datetime]:
    if not location_ids:
        return {}
    now = now_utc()
    rows = (
        db.query(Booking, Space)
        .join(Space, Space.id == Booking.space_id)
        .filter(
            Space.location_id.in_(location_ids),
            Booking.status == BookingStatus.CONFIRMED,
            Booking.checked_in_at.isnot(None),
            Booking.checked_out_at.is_(None),
            Booking.end_datetime >= now,
        )
        .order_by(Booking.checked_in_at.desc())
        .all()
    )
    presence: dict[tuple[int, int], datetime] = {}
    for booking, space in rows:
        if not booking.checked_in_at:
            continue
        presence.setdefault((booking.user_id, space.location_id), booking.checked_in_at)
    return presence


def _directory_search_filter(query, search: str | None):
    if not search or not search.strip():
        return query
    term = f"%{search.strip().lower()}%"
    return query.filter(
        or_(
            func.lower(User.email).like(term),
            func.lower(User.full_name).like(term),
            func.lower(User.first_name).like(term),
            func.lower(User.last_name).like(term),
        )
    )


def directory_items_for_member(
    db: Session,
    user: User,
    *,
    days: int = 90,
    location_public_id: str | None = None,
    search: str | None = None,
    currently_in_office: bool = False,
) -> list[dict]:
    location_ids = recent_member_location_ids(db, user.id)
    if not location_ids:
        return []
    if location_public_id:
        location = db.query(Location).filter(Location.public_id == location_public_id).first()
        if not location or location.id not in location_ids:
            return []
        location_ids = {location.id}
    cutoff = now_utc() - timedelta(days=max(1, days))
    today = now_utc().date()
    presence_by_key = _current_presence_by_member_location(db, location_ids)
    query = (
        db.query(Booking, User, Space, Location)
        .join(User, User.id == Booking.user_id)
        .join(Space, Space.id == Booking.space_id)
        .join(Location, Location.id == Space.location_id)
        .filter(
            Space.location_id.in_(location_ids),
            Booking.user_id != user.id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.start_datetime >= cutoff,
        )
    )
    rows = _directory_search_filter(query, search).order_by(Booking.start_datetime.desc()).all()
    out: dict[tuple[int, int], dict] = {}
    for booking, member, space, location in rows:
        key = (member.id, location.id)
        if key in out:
            continue
        checked_in_at = presence_by_key.get(key)
        out[key] = {
            "member_public_id": member.public_id,
            "name": _display_name(member),
            "email": member.email,
            "location_public_id": location.public_id,
            "location_name": location.name,
            "space_public_id": space.public_id,
            "space_name": _space_name(space),
            "space_type": getattr(space.space_type, "value", space.space_type),
            "last_seen_at": booking.start_datetime,
            "is_currently_in_office": checked_in_at is not None,
            "checked_in_at": checked_in_at,
        }
    subscription_query = (
        db.query(Subscription, User, Space, Location)
        .join(User, User.id == Subscription.user_id)
        .join(Space, Space.id == Subscription.space_id)
        .join(Location, Location.id == Space.location_id)
        .filter(
            Space.location_id.in_(location_ids),
            Subscription.user_id != user.id,
            Subscription.status.in_(["active", "canceling"]),
            Subscription.start_date <= today,
            or_(Subscription.end_date.is_(None), Subscription.end_date >= today),
        )
    )
    subscription_rows = _directory_search_filter(subscription_query, search).order_by(Subscription.start_date.desc()).all()
    for subscription, member, space, location in subscription_rows:
        key = (member.id, location.id)
        if key in out:
            continue
        checked_in_at = presence_by_key.get(key)
        out[key] = {
            "member_public_id": member.public_id,
            "name": _display_name(member),
            "email": member.email,
            "location_public_id": location.public_id,
            "location_name": location.name,
            "space_public_id": space.public_id,
            "space_name": _space_name(space),
            "space_type": getattr(space.space_type, "value", space.space_type),
            "last_seen_at": datetime.combine(subscription.start_date, datetime.min.time(), tzinfo=timezone.utc),
            "is_currently_in_office": checked_in_at is not None,
            "checked_in_at": checked_in_at,
        }
    rows = list(out.values())
    if currently_in_office:
        rows = [row for row in rows if row["is_currently_in_office"]]
    return rows
