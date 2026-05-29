from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from datetime import datetime, timezone

from app.core.auth import get_current_user
from app.core.config import settings
from app.db.deps import get_db
from app.models.payment import Payment
from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.location import Location
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.subscription import Subscription
from app.models.space import Space
from app.models.user import User
from app.models.enums import AvailabilityStatus
from app.models.organization import Organization
from app.schemas.payment import (
    PaymentIntentCreate,
    PaymentIntentOut,
    SubscriptionPurchase,
    SubscriptionPurchaseOut,
    MemberPortalOut,
    PaymentOut,
    OwnerPayoutSummaryOut,
)
from app.models.enums import UserAppRole, UserRole, PaymentStatus, BookingStatus
from app.models.pricing_rule import PricingRule
from app.models.tax_config import TaxConfig
from app.services.auth_user import get_or_create_user, require_verified_email_for_payments
from app.services.authz import accessible_location_ids, get_org_member, list_org_members, require_owner_or_admin
from app.services.pricing import estimate_booking_amount
from app.services.payment_metadata import normalize_payment_failure_reason
from app.services.stripe_payments import (
    create_billing_portal_session,
    create_customer,
    create_payment_intent,
    create_subscription,
)
from app.models.subscription_plan import SubscriptionPlan

router = APIRouter()


def _payment_context(
    db: Session, payment: Payment
) -> tuple[Booking | None, BookingRequest | None, Subscription | None, Space | None, Location | None]:
    booking = db.query(Booking).filter(Booking.id == payment.booking_id).first() if payment.booking_id else None
    booking_request = (
        db.query(BookingRequest).filter(BookingRequest.id == payment.booking_request_id).first()
        if payment.booking_request_id
        else None
    )
    subscription = (
        db.query(Subscription).filter(Subscription.id == payment.subscription_id).first()
        if payment.subscription_id
        else None
    )
    space_id = booking.space_id if booking else booking_request.space_id if booking_request else subscription.space_id if subscription else None
    space = db.query(Space).filter(Space.id == space_id).first() if space_id else None
    location = db.query(Location).filter(Location.id == space.location_id).first() if space else None
    return booking, booking_request, subscription, space, location


def _to_out(db: Session, payment: Payment) -> PaymentOut:
    booking, booking_request, subscription, space, location = _payment_context(db, payment)
    member = db.query(User).filter(User.id == payment.user_id).first() if payment.user_id else None
    org = db.query(Organization).filter(Organization.id == payment.tenant_id).first() if payment.tenant_id else None
    method = (
        db.query(MemberOwnerPaymentMethod).filter(MemberOwnerPaymentMethod.id == payment.payment_method_id).first()
        if payment.payment_method_id
        else None
    )
    return PaymentOut(
        id=payment.id,
        public_id=payment.public_id,
        amount=payment.amount,
        provider=payment.provider,
        status=payment.status.value if payment.status else "",
        tenant_id=payment.tenant_id,
        member_public_id=member.public_id if member else None,
        member_name=(
            member.full_name
            or " ".join(part for part in [member.first_name, member.last_name] if part)
            or None
        ) if member else None,
        member_email=member.email if member else None,
        booking_id=payment.booking_id,
        booking_public_id=booking.public_id if booking else None,
        booking_request_public_id=booking_request.public_id if booking_request else None,
        booking_start_datetime=booking.start_datetime if booking else None,
        booking_end_datetime=booking.end_datetime if booking else None,
        booking_request_id=payment.booking_request_id,
        subscription_id=payment.subscription_id,
        subscription_public_id=subscription.public_id if subscription else None,
        subscription_start_date=subscription.start_date.isoformat() if subscription and subscription.start_date else None,
        subscription_end_date=subscription.end_date.isoformat() if subscription and subscription.end_date else None,
        space_public_id=space.public_id if space else None,
        space_name=space.name if space else None,
        space_type=space.space_type.value if space and space.space_type else None,
        location_public_id=location.public_id if location else None,
        location_name=location.name if location else None,
        location_city=location.city if location else None,
        organization_public_id=org.public_id if org else None,
        organization_name=org.name if org else None,
        payment_method_id=payment.payment_method_id,
        payment_method_public_id=method.public_id if method else None,
        payment_method_brand=method.brand if method else None,
        payment_method_last4=method.last4 if method else None,
        payment_method_exp_month=method.exp_month if method else None,
        payment_method_exp_year=method.exp_year if method else None,
        amount_cents=payment.amount_cents,
        subtotal_cents=payment.subtotal_cents,
        discount_cents=payment.discount_cents,
        tax_cents=payment.tax_cents,
        refunded_amount_cents=payment.refunded_amount_cents,
        currency=payment.currency,
        provider_payment_id=payment.provider_payment_id,
        provider_reference_id=payment.provider_reference_id,
        failure_reason=normalize_payment_failure_reason(payment.failure_reason) if payment.failure_reason else None,
        commission_rate_pct=payment.commission_rate_pct,
        platform_fee_amount=payment.platform_fee_amount,
        owner_net_amount=payment.owner_net_amount,
        created_at=payment.created_at,
    )


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
    require_verified_email_for_payments(user)

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
    require_verified_email_for_payments(user)

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
    require_verified_email_for_payments(user)

    if not user.stripe_customer_id:
        customer = create_customer(email=user.email)
        user.stripe_customer_id = customer.id
        db.add(user)
        db.commit()
        db.refresh(user)

    session = create_billing_portal_session(
        user.stripe_customer_id,
        f"{settings.FRONTEND_URL}/member/payments",
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
    return [_to_out(db, payment) for payment in payments]


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
        return _to_out(db, payment)

    if not _payment_visible_to_member(db, user.id, payment):
        raise HTTPException(status_code=404, detail="Payment not found")
    return _to_out(db, payment)


@router.get("/owner/payout-summary", response_model=OwnerPayoutSummaryOut)
def owner_payout_summary(
    organization_public_id: str,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    org = db.query(Organization).filter(Organization.public_id == organization_public_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    member = get_org_member(db, org.id, user.id)
    require_owner_or_admin(member)

    query = db.query(Payment).filter(Payment.tenant_id == org.id)
    if from_date:
        query = query.filter(Payment.created_at >= from_date)
    if to_date:
        query = query.filter(Payment.created_at <= to_date)
    payments = query.all()

    succeeded_statuses = {
        PaymentStatus.SUCCEEDED,
        PaymentStatus.PARTIALLY_REFUNDED,
        PaymentStatus.REFUNDED,
        PaymentStatus.VOIDED,
    }
    succeeded = [p for p in payments if p.status in succeeded_statuses]
    gross_cents = sum(p.amount_cents if p.amount_cents is not None else p.amount * 100 for p in succeeded)
    tax_cents = sum(p.tax_cents or 0 for p in succeeded)
    refunded_cents = sum(p.refunded_amount_cents or 0 for p in succeeded)
    platform_fee_cents = sum((p.platform_fee_amount or 0) * 100 for p in succeeded)
    owner_net_cents = sum((p.owner_net_amount or 0) * 100 for p in succeeded) - refunded_cents
    failed_count = len([p for p in payments if p.status == PaymentStatus.FAILED])
    return OwnerPayoutSummaryOut(
        gross_cents=gross_cents,
        tax_cents=tax_cents,
        refunded_cents=refunded_cents,
        platform_fee_cents=platform_fee_cents,
        owner_net_cents=owner_net_cents,
        succeeded_count=len(succeeded),
        failed_count=failed_count,
    )
