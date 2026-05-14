from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.enums import UserAppRole, UserRole
from app.models.user import User
from app.schemas.invoice import InvoiceOut
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, list_org_members
from app.services.invoices import generate_invoice_pdf

router = APIRouter()


def _member_name(member: User | None) -> str | None:
    if not member:
        return None
    return (
        member.full_name
        or " ".join(part for part in [member.first_name, member.last_name] if part)
        or None
    )


def _invoice_context(
    db: Session, invoice: Invoice
) -> tuple[Payment | None, Booking | None, Subscription | None, Space | None, Location | None, User | None]:
    payment = db.query(Payment).filter(Payment.id == invoice.payment_id).first() if invoice.payment_id else None
    booking = db.query(Booking).filter(Booking.id == invoice.booking_id).first() if invoice.booking_id else None
    if not booking and payment and payment.booking_id:
        booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()

    subscription = None
    if payment and payment.subscription_id:
        subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()

    space_id = booking.space_id if booking else subscription.space_id if subscription else None
    space = db.query(Space).filter(Space.id == space_id).first() if space_id else None
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    member = db.query(User).filter(User.id == invoice.user_id).first() if invoice.user_id else None
    return payment, booking, subscription, space, location, member


def _description(booking: Booking | None, subscription: Subscription | None) -> str:
    if booking:
        return "Booking receipt"
    if subscription:
        return "Membership invoice"
    return "Invoice"


def _to_out(db: Session, invoice: Invoice) -> InvoiceOut:
    payment, booking, subscription, space, location, member = _invoice_context(db, invoice)
    return InvoiceOut(
        public_id=invoice.public_id,
        amount=invoice.amount,
        status=invoice.status,
        booking_id=invoice.booking_id,
        booking_public_id=booking.public_id if booking else None,
        booking_start_datetime=booking.start_datetime if booking else None,
        booking_end_datetime=booking.end_datetime if booking else None,
        payment_id=invoice.payment_id,
        payment_public_id=payment.public_id if payment else None,
        payment_provider=payment.provider if payment else None,
        payment_status=payment.status.value if payment and payment.status else None,
        subscription_public_id=subscription.public_id if subscription else None,
        subscription_start_date=subscription.start_date.isoformat() if subscription and subscription.start_date else None,
        subscription_end_date=subscription.end_date.isoformat() if subscription and subscription.end_date else None,
        space_public_id=space.public_id if space else None,
        space_name=space.name if space else None,
        space_type=space.space_type.value if space and space.space_type else None,
        location_public_id=location.public_id if location else None,
        location_name=location.name if location else None,
        location_city=location.city if location else None,
        member_name=_member_name(member),
        member_email=member.email if member else None,
        description=_description(booking, subscription),
        pdf_url=invoice.pdf_url,
        created_at=invoice.created_at,
    )


def _invoice_visible_to_member(db: Session, user_id: int, invoice: Invoice) -> bool:
    members = list_org_members(db, user_id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if not members:
        return False

    owner_tenant_ids = {member.tenant_id for member in members if member.role == UserRole.OWNER}
    if invoice.tenant_id in owner_tenant_ids:
        return True

    allowed_location_ids = accessible_location_ids(db, user_id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if not allowed_location_ids:
        return False

    if invoice.booking_id:
        booking = db.query(Booking).filter(Booking.id == invoice.booking_id).first()
        if not booking:
            return False
        space = db.query(Space).filter(Space.id == booking.space_id).first()
        return bool(space and space.location_id in allowed_location_ids)

    if invoice.payment_id:
        payment = db.query(Payment).filter(Payment.id == invoice.payment_id).first()
        if not payment:
            return False
        if payment.booking_id:
            booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
            if not booking:
                return False
            space = db.query(Space).filter(Space.id == booking.space_id).first()
            return bool(space and space.location_id in allowed_location_ids)
        if payment.subscription_id:
            subscription = db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
            if not subscription:
                return False
            space = db.query(Space).filter(Space.id == subscription.space_id).first()
            return bool(space and space.location_id in allowed_location_ids)
        return False

    return False


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(Invoice)
    if user.role == UserAppRole.MEMBER:
        query = query.filter(Invoice.user_id == user.id)
        invoices = query.order_by(Invoice.created_at.desc()).all()
    else:
        members = list_org_members(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        tenant_ids = [m.tenant_id for m in members]
        if not tenant_ids:
            return []
        invoices = query.filter(Invoice.tenant_id.in_(tenant_ids)).order_by(Invoice.created_at.desc()).all()
        invoices = [invoice for invoice in invoices if _invoice_visible_to_member(db, user.id, invoice)]
    return [_to_out(db, invoice) for invoice in invoices]


@router.get("/invoices/{public_id}", response_model=InvoiceOut)
def get_invoice(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    invoice = db.query(Invoice).filter(Invoice.public_id == public_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    user = get_or_create_user(db, token)
    if user.role == UserAppRole.MEMBER:
        if invoice.user_id != user.id:
            raise HTTPException(status_code=404, detail="Invoice not found")
        return _to_out(db, invoice)

    if not _invoice_visible_to_member(db, user.id, invoice):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _to_out(db, invoice)


@router.get("/invoices/{public_id}/pdf")
def download_invoice_pdf(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    invoice = db.query(Invoice).filter(Invoice.public_id == public_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    user = get_or_create_user(db, token)
    if user.role == UserAppRole.MEMBER:
        if invoice.user_id != user.id:
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not _invoice_visible_to_member(db, user.id, invoice):
        raise HTTPException(status_code=404, detail="Invoice not found")

    out = _to_out(db, invoice)
    try:
        content = generate_invoice_pdf(
            {
                "invoice_number": out.public_id,
                "issued_at": out.created_at.date().isoformat() if out.created_at else None,
                "member_name": out.member_name,
                "member_email": out.member_email,
                "booking_public_id": out.booking_public_id,
                "subscription_public_id": out.subscription_public_id,
                "payment_public_id": out.payment_public_id,
                "payment_provider": out.payment_provider,
                "payment_status": out.payment_status,
                "space_name": out.space_name,
                "location_name": out.location_name,
                "description": out.description,
                "status": out.status,
                "amount": out.amount,
            }
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{invoice.public_id}.pdf"'},
    )
