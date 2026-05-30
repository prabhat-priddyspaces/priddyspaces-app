from datetime import datetime, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import AvailabilityStatus, BookingRequestStatus, BookingStatus, PaymentStatus, SpaceType, UserAppRole
from app.models.invoice import Invoice
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment_event import PaymentEvent
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User
from app.services.stripe_handlers import handle_event


def test_handle_event_sets_tenant_and_confirms_booking(db_session):
    booking = Booking(
        user_id=1,
        space_id=1,
        tenant_id=99,
        start_datetime=datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    payment = Payment(
        user_id=1,
        booking_id=booking.id,
        amount=2000,
        provider="stripe",
        status=PaymentStatus.REQUIRES_PAYMENT,
        stripe_payment_intent_id="pi_test_1"
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)

    event = {
        "id": "evt_test_1",
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": "pi_test_1",
                "receipt_email": "customer@example.com",
                "metadata": {
                    "booking_public_id": booking.public_id
                }
            }
        }
    }

    result = handle_event(db_session, event)
    assert result["handled"] is True

    db_session.refresh(payment)
    db_session.refresh(booking)
    payment_event = db_session.query(PaymentEvent).filter(PaymentEvent.event_id == "evt_test_1").first()

    assert payment.status == PaymentStatus.SUCCEEDED
    assert booking.status == BookingStatus.CONFIRMED
    assert payment.tenant_id == booking.tenant_id
    assert payment_event is not None
    assert payment_event.tenant_id == booking.tenant_id
    invoice = db_session.query(Invoice).filter(Invoice.payment_id == payment.id).first()
    assert invoice is not None
    assert invoice.amount == payment.amount


def _failed_booking_request_seed(db_session):
    user = User(
        email="stripe-repair-member@example.com",
        auth_subject="stripe-repair-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    owner = User(
        email="stripe-repair-owner@example.com",
        auth_subject="stripe-repair-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([user, owner])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(owner)

    org = Organization(name="Stripe Repair Org", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Stripe Repair Location",
        address="123 Main",
        city="Orlando",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=6,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_hourly=150,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    booking = Booking(
        user_id=user.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    req = BookingRequest(
        tenant_id=org.id,
        user_id=user.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        payment_provider="stripe",
        payment_attempt_count=2,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    payment = Payment(
        user_id=user.id,
        booking_request_id=req.id,
        booking_id=booking.id,
        tenant_id=org.id,
        amount=300,
        amount_cents=30000,
        provider="stripe",
        status=PaymentStatus.FAILED,
        failure_reason="0",
        attempt_number=2,
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)
    return req, booking, payment


def test_payment_intent_succeeded_with_request_metadata_repairs_failed_booking_request(db_session):
    req, booking, payment = _failed_booking_request_seed(db_session)
    event = {
        "id": "evt_booking_request_success_1",
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": "pi_repair_1",
                "amount": 30000,
                "currency": "usd",
                "latest_charge": "ch_repair_1",
                "metadata": {"booking_request_public_id": req.public_id},
            }
        },
    }

    result = handle_event(db_session, event)

    assert result["handled"] is True
    db_session.refresh(req)
    db_session.refresh(booking)
    db_session.refresh(payment)
    assert req.status == BookingRequestStatus.APPROVED
    assert req.payment_status == "succeeded"
    assert booking.status == BookingStatus.CONFIRMED
    assert payment.status == PaymentStatus.SUCCEEDED
    assert payment.stripe_payment_intent_id == "pi_repair_1"
    assert payment.provider_payment_id == "pi_repair_1"
    invoice = db_session.query(Invoice).filter(Invoice.payment_id == payment.id).first()
    payment_event = db_session.query(PaymentEvent).filter(PaymentEvent.event_id == "evt_booking_request_success_1").first()
    assert invoice is not None
    assert payment_event is not None
    assert payment_event.tenant_id == req.tenant_id


def test_payment_intent_succeeded_repair_is_idempotent(db_session):
    req, _booking, payment = _failed_booking_request_seed(db_session)
    event = {
        "id": "evt_booking_request_success_2",
        "type": "payment_intent.succeeded",
        "data": {
            "object": {
                "id": "pi_repair_2",
                "amount": 30000,
                "currency": "usd",
                "metadata": {"booking_request_public_id": req.public_id},
            }
        },
    }
    second_event = {**event, "id": "evt_booking_request_success_3"}

    handle_event(db_session, event)
    handle_event(db_session, second_event)

    invoices = db_session.query(Invoice).filter(Invoice.payment_id == payment.id).all()
    payments = db_session.query(Payment).filter(Payment.booking_request_id == req.id).all()
    assert len(invoices) == 1
    assert len(payments) == 1


def test_payment_intent_failed_does_not_downgrade_succeeded_payment(db_session):
    _req, _booking, payment = _failed_booking_request_seed(db_session)
    payment.status = PaymentStatus.SUCCEEDED
    payment.stripe_payment_intent_id = "pi_success_already"
    db_session.add(payment)
    db_session.commit()

    event = {
        "id": "evt_late_failed_1",
        "type": "payment_intent.payment_failed",
        "data": {
            "object": {
                "id": "pi_success_already",
                "last_payment_error": {"message": "declined"},
            }
        },
    }

    result = handle_event(db_session, event)

    db_session.refresh(payment)
    assert result["ignored"] == "already_succeeded"
    assert payment.status == PaymentStatus.SUCCEEDED
    assert payment.failure_reason == "0"


def test_invoice_paid_creates_subscription_payment_and_invoice(db_session):
    subscription = Subscription(
        user_id=7,
        space_id=11,
        tenant_id=91,
        status="pending",
        start_date=datetime(2026, 2, 1, tzinfo=timezone.utc).date(),
        end_date=None,
        stripe_subscription_id="sub_test_paid",
    )
    db_session.add(subscription)
    db_session.commit()
    db_session.refresh(subscription)

    event = {
        "id": "evt_invoice_paid_1",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": "in_test_paid_1",
                "subscription": "sub_test_paid",
                "payment_intent": "pi_sub_paid_1",
                "amount_paid": 150000,
                "number": "INV-2026-001",
                "created": 1760000000,
            }
        },
    }

    result = handle_event(db_session, event)
    assert result["handled"] is True

    db_session.refresh(subscription)
    payment = db_session.query(Payment).filter(Payment.subscription_id == subscription.id).first()
    invoice = db_session.query(Invoice).filter(Invoice.payment_id == payment.id).first()

    assert subscription.status == "active"
    assert payment is not None
    assert payment.status == PaymentStatus.SUCCEEDED
    assert payment.amount == 1500
    assert invoice is not None
    assert invoice.status == "paid"
    assert invoice.amount == 1500


def test_invoice_payment_failed_creates_failed_subscription_payment(db_session):
    subscription = Subscription(
        user_id=8,
        space_id=12,
        tenant_id=92,
        status="pending",
        start_date=datetime(2026, 2, 1, tzinfo=timezone.utc).date(),
        end_date=None,
        stripe_subscription_id="sub_test_failed",
    )
    db_session.add(subscription)
    db_session.commit()
    db_session.refresh(subscription)

    event = {
        "id": "evt_invoice_failed_1",
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "id": "in_test_failed_1",
                "subscription": "sub_test_failed",
                "payment_intent": "pi_sub_failed_1",
                "amount_due": 90000,
            }
        },
    }

    result = handle_event(db_session, event)
    assert result["handled"] is True

    db_session.refresh(subscription)
    payment = db_session.query(Payment).filter(Payment.subscription_id == subscription.id).first()
    invoice = db_session.query(Invoice).filter(Invoice.payment_id == payment.id).first()

    assert subscription.status == "past_due"
    assert payment is not None
    assert payment.status == PaymentStatus.FAILED
    assert payment.amount == 900
    assert invoice is not None
    assert invoice.status == "payment_failed"
