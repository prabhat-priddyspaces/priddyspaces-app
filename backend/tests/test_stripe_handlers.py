from datetime import datetime, timezone

from app.models.booking import Booking
from app.models.enums import BookingStatus, PaymentStatus
from app.models.payment_event import PaymentEvent
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription
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
