from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus, BookingRequestStatus, BookingStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.space import Space
from app.models.booking import Booking
from app.models.booking_series import BookingSeries
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.services.payment_providers import ChargeResult


def _seed_owner_space(db):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Owner Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC"
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
        price_hourly=50,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, space


def _seed_payment_method(db, customer: User, space: Space) -> CustomerOwnerPaymentMethod:
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    method = CustomerOwnerPaymentMethod(
        user_id=customer.id,
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_test",
        provider_payment_method_id="pm_test",
        last4="4242",
        brand="visa",
        exp_month=12,
        exp_year=2030,
        is_default_for_owner=True,
        status="active",
    )
    db.add(method)
    db.commit()
    db.refresh(method)
    return method


class FakeProvider:
    def charge_saved_method(self, **kwargs):
        return ChargeResult(status="succeeded", provider_payment_id="pi_owner_test", raw_response={"ok": True})


def _request_payload(space: Space, method: CustomerOwnerPaymentMethod | None, day: int = 10):
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, day, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, day, 12, 0, tzinfo=timezone.utc).isoformat(),
        "payment_authorization_consent": True,
    }
    if method:
        payload["customer_owner_payment_method_public_id"] = method.public_id
    return payload


def test_booking_request_create_and_list(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust@example.com",
        auth_subject="sub-cust",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)

    customer_client = client_factory({
        "sub": "sub-cust",
        "email": "cust@example.com",
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.REQUESTED.value
    assert data["estimated_amount"] is not None

    listing = customer_client.get("/api/booking-requests")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    assert len(owner_list.json()) == 1


def test_booking_request_approve_creates_booking(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust2@example.com",
        auth_subject="sub-cust-2",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)

    customer_client = client_factory({
        "sub": "sub-cust-2",
        "email": customer.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 2, 12, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    approved = approve.json()
    assert approved["status"] == BookingRequestStatus.APPROVED.value
    assert approved["booking_id"] is not None
    assert approved["estimated_amount"] is not None

    booking = db_session.query(Booking).filter(Booking.id == approved["booking_id"]).first()
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED


def test_booking_request_reject(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust3@example.com",
        auth_subject="sub-cust-3",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)

    customer_client = client_factory({
        "sub": "sub-cust-3",
        "email": customer.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 3, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 3, 12, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200
    assert reject.json()["status"] == BookingRequestStatus.REJECTED.value


def test_instant_booking_flag_auto_approves(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust4@example.com",
        auth_subject="sub-cust-4",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    flag = owner_client.post(
        "/api/feature-flags",
        json={
            "flag_key": "instant_booking_enabled",
            "flag_value": True,
            "scope_type": "space",
            "scope_public_id": space.public_id
        }
    )
    assert flag.status_code == 200

    customer_client = client_factory({
        "sub": "sub-cust-4",
        "email": customer.email,
        "email_verified": True
    })
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 4, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 4, 12, 0, tzinfo=timezone.utc).isoformat(),
        "customer_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.APPROVED.value
    assert data["booking_id"] is not None


def test_explicit_instant_booking_confirms_and_blocks_overlap(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="instant@example.com",
        auth_subject="sub-instant",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    customer_client = client_factory({
        "sub": "sub-instant",
        "email": customer.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 13)
    payload["booking_mode"] = "hourly"

    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    body = create.json()
    assert body["instant_booking"] is True
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["payment_status"] == "succeeded"
    assert body["booking_id"] is not None

    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    summary = owner_client.get(f"/api/owner/payout-summary?organization_public_id={org.public_id}")
    assert summary.status_code == 200
    assert summary.json()["gross_cents"] == 100

    overlap = customer_client.post("/api/booking-requests", json=payload)
    assert overlap.status_code == 409, overlap.text


def test_recurring_instant_booking_creates_confirmed_series(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    _owner, space = _seed_owner_space(db_session)
    customer = User(
        email="recurring@example.com",
        auth_subject="sub-recurring",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    customer_client = client_factory({
        "sub": "sub-recurring",
        "email": customer.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 14)
    payload["booking_mode"] = "hourly"
    payload["recurrence"] = {"frequency": "weekly", "interval": 1, "count": 3}

    create = customer_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    body = create.json()
    assert body["status"] == BookingRequestStatus.APPROVED.value
    assert body["occurrence_count"] == 3
    assert body["booking_series_public_id"] is not None

    series = db_session.query(BookingSeries).filter(BookingSeries.public_id == body["booking_series_public_id"]).first()
    assert series is not None
    bookings = db_session.query(Booking).filter(Booking.booking_series_id == series.id).all()
    assert len(bookings) == 3
    assert {booking.status for booking in bookings} == {BookingStatus.CONFIRMED}


def test_booking_request_requires_payment_method(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust5@example.com",
        auth_subject="sub-cust-5",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    db_session.add(OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    ))
    db_session.commit()

    customer_client = client_factory({
        "sub": "sub-cust-5",
        "email": customer.email,
        "email_verified": True,
    })
    create = customer_client.post("/api/booking-requests", json=_request_payload(space, None, 5))
    assert create.status_code == 400
    assert "Payment method is required" in create.text


def test_payment_failure_marks_request_payment_failed(db_session, client_factory, monkeypatch):
    class FailingProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="failed", failure_reason="declined", raw_response={"resp": "declined"})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FailingProvider())
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust6@example.com",
        auth_subject="sub-cust-6",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    customer_client = client_factory({
        "sub": "sub-cust-6",
        "email": customer.email,
        "email_verified": True,
    })
    create = customer_client.post("/api/booking-requests", json=_request_payload(space, method, 6))
    req_id = create.json()["public_id"]
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    body = approve.json()
    assert body["status"] == BookingRequestStatus.PAYMENT_FAILED.value
    assert body["payment_status"] == "failed"
    assert body["booking_id"] is None


def test_provider_switch_does_not_break_frozen_request(db_session, client_factory, monkeypatch):
    seen_providers: list[str] = []

    class RecordingProvider:
        def __init__(self, provider: str):
            self.provider = provider

        def charge_saved_method(self, **kwargs):
            seen_providers.append(self.provider)
            return ChargeResult(status="succeeded", provider_payment_id="pi_frozen", raw_response={"ok": True})

    monkeypatch.setattr(
        "app.services.booking_payments.PaymentProviderFactory.get",
        lambda setting: RecordingProvider(setting.provider),
    )
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust7@example.com",
        auth_subject="sub-cust-7",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    customer_client = client_factory({
        "sub": "sub-cust-7",
        "email": customer.email,
        "email_verified": True,
    })
    create = customer_client.post("/api/booking-requests", json=_request_payload(space, method, 7))
    req_id = create.json()["public_id"]

    org = db_session.query(Organization).filter(Organization.id == space.tenant_id).first()
    org.payment_provider = "cardpointe"
    db_session.add(org)
    db_session.add(OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="cardpointe",
        is_enabled=True,
        cardpointe_merchant_id="mid",
    ))
    db_session.commit()

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200
    assert approve.json()["status"] == BookingRequestStatus.APPROVED.value
    assert seen_providers == ["stripe"]


def test_double_approval_charges_once(db_session, client_factory, monkeypatch):
    charge_count = {"count": 0}

    class CountingProvider:
        def charge_saved_method(self, **kwargs):
            charge_count["count"] += 1
            return ChargeResult(status="succeeded", provider_payment_id="pi_once", raw_response={"ok": True})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: CountingProvider())
    owner, space = _seed_owner_space(db_session)
    customer = User(
        email="cust8@example.com",
        auth_subject="sub-cust-8",
        role=UserAppRole.CUSTOMER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(customer)
    db_session.commit()
    db_session.refresh(customer)
    method = _seed_payment_method(db_session, customer, space)
    customer_client = client_factory({
        "sub": "sub-cust-8",
        "email": customer.email,
        "email_verified": True,
    })
    create = customer_client.post("/api/booking-requests", json=_request_payload(space, method, 8))
    req_id = create.json()["public_id"]
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True,
    })
    first = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    second = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["booking_id"] == second.json()["booking_id"]
    assert charge_count["count"] == 1
