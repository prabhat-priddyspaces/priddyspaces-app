from datetime import datetime, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestKind,
    BookingRequestStatus,
    BookingStatus,
    SpaceType,
    UserAppRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User


def _seed_pending_hourly_booking(db):
    member = User(
        email="intent-member@example.com",
        auth_subject="intent-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    owner = User(
        email="intent-owner@example.com",
        auth_subject="intent-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add_all([member, owner])
    db.commit()
    db.refresh(member)
    db.refresh(owner)

    org = Organization(name="Intent Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Intent HQ",
        address="123 Main",
        city="Testville",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Hourly Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_hourly=25,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    req = BookingRequest(
        tenant_id=org.id,
        user_id=member.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.APPROVED,
        request_kind=BookingRequestKind.HOURLY_BOOKING.value,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    booking.booking_request_id = req.id
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return member, booking


class _Intent:
    id = "pi_booking_intent"
    client_secret = "pi_booking_secret"


def _member_client(client_factory):
    return client_factory(
        {
            "sub": "intent-member",
            "email": "intent-member@example.com",
            "email_verified": True,
        }
    )


def test_payment_intent_requires_booking(db_session, client_factory, monkeypatch):
    _seed_pending_hourly_booking(db_session)
    called = {"value": False}

    def fail_create_payment_intent(*_args, **_kwargs):
        called["value"] = True
        raise AssertionError("Stripe intent should not be created")

    monkeypatch.setattr("app.api.payments.create_payment_intent", fail_create_payment_intent)

    resp = _member_client(client_factory).post(
        "/api/payments/intent",
        json={"amount": 999999, "currency": "usd"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Booking is required for payment"
    assert called["value"] is False


def test_payment_intent_derives_amount_from_hourly_booking(
    db_session, client_factory, monkeypatch
):
    _member, booking = _seed_pending_hourly_booking(db_session)
    captured = {}

    def fake_create_payment_intent(amount, currency, metadata):
        captured["amount"] = amount
        captured["currency"] = currency
        captured["metadata"] = metadata
        return _Intent()

    monkeypatch.setattr("app.api.payments.create_payment_intent", fake_create_payment_intent)

    resp = _member_client(client_factory).post(
        "/api/payments/intent",
        json={
            "amount": 999999,
            "currency": "usd",
            "booking_public_id": booking.public_id,
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["client_secret"] == "pi_booking_secret"
    assert captured["amount"] == 5000
    assert captured["currency"] == "usd"
    assert captured["metadata"]["booking_public_id"] == booking.public_id
    payment = db_session.query(Payment).filter(Payment.booking_id == booking.id).first()
    assert payment is not None
    assert payment.amount == 5000
    assert payment.stripe_payment_intent_id == "pi_booking_intent"
