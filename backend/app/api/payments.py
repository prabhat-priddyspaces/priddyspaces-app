from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.payment import Payment
from app.models.booking import Booking
from app.models.subscription import Subscription
from app.models.space import Space
from app.models.enums import AvailabilityStatus
from app.schemas.payment import (
    PaymentIntentCreate,
    PaymentIntentOut,
    SubscriptionPurchase,
    SubscriptionPurchaseOut,
    MemberPortalOut,
    PaymentOut
)
from app.models.enums import UserAppRole, UserRole, PaymentStatus, BookingStatus
from app.models.pricing_rule import PricingRule
from app.models.tax_config import TaxConfig
from app.services.auth_user import get_or_create_user
from app.services.authz import accessible_location_ids, list_org_members
from app.services.pricing import estimate_booking_amount
from app.services.stripe_payments import (
    create_billing_portal_session,
    create_customer,
    create_payment_intent,
    create_subscription,
)
from app.models.subscription_plan import SubscriptionPlan

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


def _booking_charge_amount(db: Session, booking: Booking) -> int:
    space = db.query(Space).filter(Space.id == booking.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    rule = _get_active_pricing_rule(db, space.id)
    tax = db.query(TaxConfig).filter(TaxConfig.tenant_id == space.tenant_id).first()
    amount = estimate_booking_amount(
        booking.start_datetime,
        booking.end_datetime,
        space.price_daily,
        space.price_monthly,
        rate_type=rule.rate_type if rule else None,
        rate_amount=rule.rate_amount if rule else None,
        tax_rate_percent=tax.rate_percent if tax else None,
    )
    if amount is None:
        raise HTTPException(status_code=400, detail="Unable to calculate booking amount")
    return amount


def _payment_visible_to_member(db: Session, user_id: int, payment: Payment) -> bool:
    members = list_org_members(db, user_id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if not members:
        return False

    owner_tenant_ids = {member.tenant_id for member in members if member.role == UserRole.OWNER}
    if payment.tenant_id in owner_tenant_ids:
        return True

    allowed_location_ids = accessible_location_ids(db, user_id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
    if not allowed_location_ids:
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


@router.post("/payments/intent", response_model=PaymentIntentOut)
def create_intent(
    payload: PaymentIntentCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    amount = payload.amount
    booking_tenant_id = None
    booking_id = None
    if payload.booking_public_id:
        booking = db.query(Booking).filter(Booking.public_id == payload.booking_public_id).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized for this booking")
        if booking.status != BookingStatus.PENDING:
            raise HTTPException(status_code=400, detail="Booking is not payable")
        amount = _booking_charge_amount(db, booking)
        booking_tenant_id = booking.tenant_id
        booking_id = booking.id

    if amount is None:
        raise HTTPException(status_code=400, detail="Amount is required")

    intent = create_payment_intent(
        amount=amount,
        currency=payload.currency,
        metadata={"booking_public_id": payload.booking_public_id or ""}
    )

    payment = Payment(
        user_id=user.id,
        booking_id=booking_id,
        amount=amount,
        provider="stripe",
        stripe_payment_intent_id=intent.id,
        tenant_id=booking_tenant_id
    )
    db.add(payment)
    db.commit()

    return PaymentIntentOut(client_secret=intent.client_secret, payment_intent_id=intent.id)


@router.post("/payments/subscription", response_model=SubscriptionPurchaseOut)
def create_subscription_purchase(
    payload: SubscriptionPurchase,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    space = db.query(Space).filter(Space.public_id == payload.space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    if space.availability_status != AvailabilityStatus.AVAILABLE:
        raise HTTPException(status_code=400, detail="Space not available")

    stripe_price_id = payload.stripe_price_id
    if payload.subscription_plan_public_id:
        plan = (
            db.query(SubscriptionPlan)
            .filter(
                SubscriptionPlan.public_id == payload.subscription_plan_public_id,
                SubscriptionPlan.tenant_id == space.tenant_id,
                SubscriptionPlan.space_type == space.space_type,
                SubscriptionPlan.is_active.is_(True)
            )
            .first()
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Subscription plan not found")
        stripe_price_id = plan.stripe_price_id

    if not stripe_price_id:
        raise HTTPException(status_code=400, detail="Stripe price id required")

    if not user.stripe_customer_id:
        customer = create_customer(email=user.email)
        user.stripe_customer_id = customer.id
        db.add(user)
        db.commit()

    subscription = create_subscription(
        user.stripe_customer_id,
        stripe_price_id,
        metadata={"space_public_id": payload.space_public_id, "user_public_id": user.public_id}
    )

    start_dt = datetime.fromtimestamp(subscription.current_period_start, tz=timezone.utc)
    internal = Subscription(
        user_id=user.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        status="pending",
        start_date=start_dt.date(),
        end_date=None,
        stripe_subscription_id=subscription.id
    )
    db.add(internal)
    db.commit()

    client_secret = None
    latest_invoice = subscription.get("latest_invoice")
    if latest_invoice and latest_invoice.get("payment_intent"):
        client_secret = latest_invoice["payment_intent"].get("client_secret")

    return SubscriptionPurchaseOut(
        stripe_subscription_id=subscription.id,
        client_secret=client_secret
    )


@router.post("/payments/member-portal", response_model=MemberPortalOut)
def create_member_portal(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)

    if not user.stripe_customer_id:
        customer = create_customer(email=user.email)
        user.stripe_customer_id = customer.id
        db.add(user)
        db.commit()
        db.refresh(user)

    session = create_billing_portal_session(
        user.stripe_customer_id,
        f"{settings.FRONTEND_URL}/member/subscriptions",
    )
    return MemberPortalOut(url=session.url)


@router.get("/payments", response_model=list[PaymentOut])
def list_payments(
    status: PaymentStatus | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    query = db.query(Payment).order_by(Payment.created_at.desc())

    if user.role == UserAppRole.MEMBER:
        query = query.filter(Payment.user_id == user.id)
        payments = query.all()
    else:
        members = list_org_members(db, user.id, {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF})
        tenant_ids = [m.tenant_id for m in members]
        if not tenant_ids:
            return []
        payments = query.filter(Payment.tenant_id.in_(tenant_ids)).all()
        payments = [payment for payment in payments if _payment_visible_to_member(db, user.id, payment)]

    if status is not None:
        payments = [payment for payment in payments if payment.status == status]
    return payments


@router.get("/payments/{public_id}", response_model=PaymentOut)
def get_payment(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user)
):
    user = get_or_create_user(db, token)
    payment = db.query(Payment).filter(Payment.public_id == public_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if user.role == UserAppRole.MEMBER:
        if payment.user_id != user.id:
            raise HTTPException(status_code=404, detail="Payment not found")
        return payment

    if not _payment_visible_to_member(db, user.id, payment):
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment
