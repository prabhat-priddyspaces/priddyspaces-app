from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.models.booking import Booking
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.enums import UserAppRole, UserRole
from app.schemas.invoice import InvoiceOut
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, list_org_members

router = APIRouter()


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
    return invoices


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
        return invoice

    if not _invoice_visible_to_member(db, user.id, invoice):
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
