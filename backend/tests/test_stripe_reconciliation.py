from __future__ import annotations

from datetime import datetime, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import AvailabilityStatus, BookingRequestStatus, BookingStatus, PaymentStatus, SpaceType, UserAppRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.tools.reconcile_stripe_booking_payments import reconcile_failed_request_with_intent


def _seed_failed_request(db_session):
    user = User(
        email="reconcile-member@example.com",
        auth_subject="reconcile-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    owner = User(
        email="reconcile-owner@example.com",
        auth_subject="reconcile-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([user, owner])
    db_session.commit()
    db_session.refresh(user)
    db_session.refresh(owner)

    org = Organization(name="Reconcile Org", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Reconcile Location",
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
        capacity=4,
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
        start_datetime=datetime(2026, 6, 2, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
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
        payment_attempt_count=1,
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
        attempt_number=1,
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)
    return req, booking, payment


def test_reconciliation_dry_run_reports_match_without_mutation(db_session):
    req, booking, payment = _seed_failed_request(db_session)
    intent = {
        "id": "pi_reconcile_dry_run",
        "status": "succeeded",
        "amount": 30000,
        "currency": "usd",
        "metadata": {"booking_request_public_id": req.public_id},
    }

    result = reconcile_failed_request_with_intent(db_session, req, intent, execute=False)

    db_session.refresh(req)
    db_session.refresh(booking)
    db_session.refresh(payment)
    assert result["action"] == "would_repair"
    assert req.status == BookingRequestStatus.PAYMENT_FAILED
    assert booking.status == BookingStatus.PENDING
    assert payment.status == PaymentStatus.FAILED


def test_reconciliation_execute_repairs_failed_booking_request(db_session):
    req, booking, payment = _seed_failed_request(db_session)
    intent = {
        "id": "pi_reconcile_execute",
        "status": "succeeded",
        "amount": 30000,
        "currency": "usd",
        "latest_charge": "ch_reconcile_execute",
        "metadata": {"booking_request_public_id": req.public_id},
    }

    result = reconcile_failed_request_with_intent(db_session, req, intent, execute=True)

    db_session.refresh(req)
    db_session.refresh(booking)
    db_session.refresh(payment)
    assert result["action"] == "repaired"
    assert req.status == BookingRequestStatus.APPROVED
    assert req.payment_status == "succeeded"
    assert booking.status == BookingStatus.CONFIRMED
    assert payment.status == PaymentStatus.SUCCEEDED
    assert payment.stripe_payment_intent_id == "pi_reconcile_execute"
