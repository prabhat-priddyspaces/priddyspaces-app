from datetime import datetime, time, timezone

from app.models.booking import Booking
from app.models.booking_payment_link import BookingPaymentLink
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    OrganizationReviewStatus,
    PaymentStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.org_member_profile import OrgMemberProfile
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.user import User
from app.services.booking_payments import expire_payment_holds
from app.services.payment_providers import ChargeResult, SavedPaymentMethodResult


def _seed_owner_space(
    db,
    *,
    suffix: str = "one",
    owner_sub: str = "owner-sub",
    can_override_pricing: bool = True,
    provider: str = "stripe",
    hold_minutes: int = 30,
):
    owner = User(
        email=f"owner-{suffix}@test.com",
        auth_subject=owner_sub,
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
        full_name="Olivia Owner",
    )
    member = User(
        email=f"customer-{suffix}@test.com",
        auth_subject=f"member-sub-{suffix}",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        full_name="Casey Customer",
    )
    db.add_all([owner, member])
    db.flush()
    org = Organization(
        name=f"Owner Org {suffix}",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
        payment_provider=provider,
        payment_failure_hold_minutes=hold_minutes,
    )
    db.add(org)
    db.flush()
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=can_override_pricing,
        )
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=f"Main {suffix}",
        address="123 Main",
        city="Austin",
        timezone="UTC",
    )
    db.add(location)
    db.flush()
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Board Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=6,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0),
        availability_end_time=time(18, 0),
        price_hourly=50,
        price_daily=300,
    )
    db.add(space)
    setting = OwnerPaymentSetting(
        organization_id=org.id,
        tenant_id=org.id,
        provider=provider,
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
        cardpointe_merchant_id="mid",
        cardpointe_username_encrypted="user",
        cardpointe_password_encrypted="pass",
        cardpointe_site="https://cardpointe.test",
        cardpointe_tokenizer_url="https://tokenizer.test",
    )
    db.add(setting)
    db.commit()
    return owner, member, org, location, space, setting


def _payload(space: Space, **overrides):
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 7, 15, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc).isoformat(),
        "booking_mode": "hourly",
        "full_day": False,
        "seats_requested": 1,
        "payment_collection_mode": "cash_collected",
        "operator_notes": "Walk-in booking",
    }
    payload.update(overrides)
    return payload


def _client(client_factory):
    return client_factory({"sub": "owner-sub", "email": "owner@test.com"})


def test_owner_can_create_cash_booking_for_existing_member(db_session, client_factory):
    _owner, member, _org, _location, space, _setting = _seed_owner_space(db_session)
    client = _client(client_factory)

    response = client.post(
        "/api/owner/bookings",
        json=_payload(space, member_public_id=member.public_id),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["payment_collection_mode"] == "cash_collected"
    assert body["status"] == "approved"
    assert body["payment_status"] == "succeeded"
    booking = db_session.query(Booking).filter(Booking.public_id == body["booking_public_id"]).one()
    payment = db_session.query(Payment).filter(Payment.booking_id == booking.id).one()
    assert booking.status == BookingStatus.CONFIRMED
    assert payment.provider == "cash"
    assert payment.status == PaymentStatus.SUCCEEDED


def test_owner_can_create_cash_booking_for_new_member_shell(db_session, client_factory):
    _owner, _member, org, _location, space, _setting = _seed_owner_space(db_session)
    client = _client(client_factory)

    response = client.post(
        "/api/owner/bookings",
        json=_payload(
            space,
            member={
                "email": "new.member@example.com",
                "full_name": "New Member",
                "phone": "+15550102026",
                "company_name": "Acme",
            },
        ),
    )

    assert response.status_code == 200, response.text
    user = db_session.query(User).filter(User.email == "new.member@example.com").one()
    profile = (
        db_session.query(OrgMemberProfile)
        .filter(OrgMemberProfile.organization_id == org.id, OrgMemberProfile.user_id == user.id)
        .one()
    )
    assert user.email_verified is False
    assert user.role == UserAppRole.MEMBER
    assert user.phone == "+15550102026"
    assert profile.phone == "+15550102026"
    assert response.json()["registration_url"] is not None


def test_payment_link_creates_timed_pending_hold_and_expires(db_session, client_factory):
    _owner, member, _org, _location, space, _setting = _seed_owner_space(db_session, hold_minutes=0)
    client = _client(client_factory)

    response = client.post(
        "/api/owner/bookings",
        json=_payload(
            space,
            member_public_id=member.public_id,
            payment_collection_mode="payment_link",
        ),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "requested"
    assert body["payment_status"] == "payment_link_sent"
    assert body["payment_link_url"]
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == body["request_public_id"]).one()
    booking = db_session.query(Booking).filter(Booking.id == req.booking_id).one()
    link = db_session.query(BookingPaymentLink).filter(BookingPaymentLink.booking_request_id == req.id).one()
    assert booking.status == BookingStatus.PENDING
    assert link.status == "sent"

    result = expire_payment_holds(db_session)

    db_session.refresh(req)
    db_session.refresh(booking)
    db_session.refresh(link)
    assert result["expired_owner_payment_links"] == 1
    assert req.status == BookingRequestStatus.CANCELLED
    assert req.payment_status == "expired"
    assert booking.status == BookingStatus.CANCELED
    assert link.status == "expired"


def test_cardpointe_payment_link_success_confirms_booking(db_session, client_factory, monkeypatch):
    _owner, member, _org, _location, space, _setting = _seed_owner_space(db_session, provider="cardpointe")
    client = _client(client_factory)
    response = client.post(
        "/api/owner/bookings",
        json=_payload(
            space,
            member_public_id=member.public_id,
            payment_collection_mode="payment_link",
        ),
    )
    assert response.status_code == 200, response.text
    token = response.json()["payment_link_url"].rsplit("/", 1)[-1]

    class Provider:
        def save_payment_method(self, payload):
            return SavedPaymentMethodResult(
                provider_customer_id=None,
                provider_payment_method_id=None,
                card_token=payload["card_token"],
                last4=payload["last4"],
                brand="card",
                exp_month=12,
                exp_year=2030,
            )

        def charge_saved_method(self, **kwargs):
            return ChargeResult(
                status="succeeded",
                provider_payment_id="cp_payment",
                provider_reference_id="retref_1",
                raw_response={"approved": True},
            )

    monkeypatch.setattr("app.services.owner_created_bookings.PaymentProviderFactory.get", lambda setting: Provider())

    charge = client.post(
        f"/api/booking-payment-links/{token}/cardpointe-charge",
        json={"card_token": "token_4242", "last4": "4242", "expiration": "1230"},
    )

    assert charge.status_code == 200, charge.text
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == charge.json()["request_public_id"]).one()
    booking = db_session.query(Booking).filter(Booking.id == req.booking_id).one()
    link = db_session.query(BookingPaymentLink).filter(BookingPaymentLink.booking_request_id == req.id).one()
    assert req.status == BookingRequestStatus.APPROVED
    assert booking.status == BookingStatus.CONFIRMED
    assert link.status == "paid"


def test_stripe_payment_link_success_confirms_booking(db_session, client_factory, monkeypatch):
    from app.services.stripe_handlers import handle_event

    _owner, member, _org, _location, space, _setting = _seed_owner_space(db_session, provider="stripe")
    client = _client(client_factory)
    response = client.post(
        "/api/owner/bookings",
        json=_payload(
            space,
            member_public_id=member.public_id,
            payment_collection_mode="payment_link",
        ),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    token = body["payment_link_url"].rsplit("/", 1)[-1]

    class Intent:
        id = "pi_owner_link"
        client_secret = "pi_owner_link_secret"

    monkeypatch.setattr("app.services.owner_created_bookings.stripe.PaymentIntent.create", lambda **kwargs: Intent())

    intent = client.post(f"/api/booking-payment-links/{token}/stripe-intent")
    assert intent.status_code == 200, intent.text
    assert intent.json()["client_secret"] == "pi_owner_link_secret"

    event_result = handle_event(
        db_session,
        {
            "id": "evt_owner_link",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_owner_link",
                    "amount": 10000,
                    "currency": "usd",
                    "latest_charge": "ch_owner_link",
                    "metadata": {"booking_request_public_id": body["request_public_id"]},
                }
            },
        },
    )

    assert event_result["handled"] is True
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == body["request_public_id"]).one()
    booking = db_session.query(Booking).filter(Booking.id == req.booking_id).one()
    link = db_session.query(BookingPaymentLink).filter(BookingPaymentLink.booking_request_id == req.id).one()
    assert req.status == BookingRequestStatus.APPROVED
    assert booking.status == BookingStatus.CONFIRMED
    assert link.status == "paid"


def test_owner_cannot_book_inaccessible_space(db_session, client_factory):
    _seed_owner_space(db_session)
    _other_owner, _member, _org, _location, other_space, _setting = _seed_owner_space(
        db_session,
        suffix="two",
        owner_sub="other-owner-sub",
    )
    client = _client(client_factory)

    response = client.post(
        "/api/owner/bookings",
        json=_payload(
            other_space,
            member={"email": "walkin@example.com", "full_name": "Walk In"},
        ),
    )

    assert response.status_code == 403


def test_price_override_requires_permission_and_reason(db_session, client_factory):
    _owner, member, _org, _location, space, _setting = _seed_owner_space(
        db_session,
        can_override_pricing=False,
    )
    client = _client(client_factory)

    missing_reason = client.post(
        "/api/owner/bookings/preview",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 7, 15, 10, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "seats_requested": 1,
            "override_amount_cents": 1000,
        },
    )
    assert missing_reason.status_code == 422

    forbidden = client.post(
        "/api/owner/bookings",
        json=_payload(
            space,
            member_public_id=member.public_id,
            override_amount_cents=1000,
            override_reason="Front desk discount",
        ),
    )
    assert forbidden.status_code == 403
