from datetime import datetime, timedelta, timezone

from app.models.booking import Booking
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
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.payment import Payment
from app.models.space import Space
from app.models.space_access_pass import SpaceAccessPass
from app.models.space_attendance_record import SpaceAttendanceRecord
from app.models.subscription import Subscription
from app.models.user import User
from app.services.access_passes import decrypted_token, ensure_access_pass_for_booking
from app.services.payment_providers import ChargeResult


class FakeProvider:
    def charge_saved_method(self, **kwargs):
        return ChargeResult(status="succeeded", provider_payment_id="pi_access_pass", raw_response={"ok": True})


def _user(db, email: str, role: UserAppRole) -> User:
    user = User(
        email=email,
        auth_subject=f"sub-{email}",
        role=role,
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _owner_space(db, *, owner_email: str = "owner-access@example.com", auto: bool = False):
    owner = _user(db, owner_email, UserAppRole.OWNER)
    org = Organization(
        name=f"Org {owner_email}",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
        booking_approval_mode="auto" if auto else "manual",
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
        )
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=f"Location {owner_email}",
        address="123 Main",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Conference Room 2",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_hourly=50,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, location, space


def _payment_method(db, member: User, space: Space) -> MemberOwnerPaymentMethod:
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_access",
        stripe_secret_key_encrypted="sk_test_access",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    method = MemberOwnerPaymentMethod(
        user_id=member.id,
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        owner_payment_setting_id=setting.id,
        provider_customer_id="cus_access",
        provider_payment_method_id="pm_access",
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


def _owner_payment_setting(db, space: Space) -> OwnerPaymentSetting:
    setting = OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_access",
        stripe_secret_key_encrypted="sk_test_access",
    )
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


def _booking(
    db,
    member: User,
    space: Space,
    *,
    start: datetime,
    end: datetime,
    status: BookingStatus = BookingStatus.CONFIRMED,
) -> Booking:
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=start,
        end_datetime=end,
        inventory_start_datetime=start,
        inventory_end_datetime=end,
        status=status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _token_for_booking(db, booking: Booking) -> str:
    access_pass = ensure_access_pass_for_booking(db, booking)
    db.commit()
    db.refresh(access_pass)
    return decrypted_token(access_pass)


def _auth(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def _request_payload(space: Space, method: MemberOwnerPaymentMethod, *, day: int):
    return {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 7, day, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 7, day, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }


def test_manual_approval_creates_access_pass(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, _org, _location, space = _owner_space(db_session)
    member = _user(db_session, "manual-pass@example.com", UserAppRole.MEMBER)
    method = _payment_method(db_session, member, space)
    member_client = client_factory(_auth(member))
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=1))
    assert create.status_code == 200

    owner_client = client_factory(_auth(owner))
    approve = owner_client.post(f"/api/booking-requests/{create.json()['public_id']}/approve", json={})

    assert approve.status_code == 200
    assert approve.json()["status"] == BookingRequestStatus.APPROVED.value
    access_pass = db_session.query(SpaceAccessPass).one()
    assert access_pass.booking_id == approve.json()["booking_id"]
    assert access_pass.token_hash
    assert "manual-pass@example.com" not in decrypted_token(access_pass)


def test_auto_approved_booking_creates_access_pass(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    _owner, _org, _location, space = _owner_space(db_session, owner_email="auto-owner@example.com", auto=True)
    member = _user(db_session, "auto-pass@example.com", UserAppRole.MEMBER)
    method = _payment_method(db_session, member, space)
    member_client = client_factory(_auth(member))

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=2))

    assert create.status_code == 200
    assert create.json()["status"] == BookingRequestStatus.APPROVED.value
    assert db_session.query(SpaceAccessPass).count() == 1


def test_member_access_passes_are_own_only(db_session, client_factory):
    _owner, _org, _location, space = _owner_space(db_session)
    member = _user(db_session, "pass-owner@example.com", UserAppRole.MEMBER)
    other = _user(db_session, "pass-other@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    booking = _booking(db_session, member, space, start=now + timedelta(days=1), end=now + timedelta(days=1, hours=2))
    _token_for_booking(db_session, booking)

    member_client = client_factory(_auth(member))
    listed = member_client.get("/api/access-passes")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["booking_public_id"] == booking.public_id
    assert "pass-owner@example.com" not in listed.json()[0]["qr_payload"]

    other_client = client_factory(_auth(other))
    denied = other_client.post("/api/access-passes", json={"booking_public_id": booking.public_id})
    assert denied.status_code == 404


def test_check_in_blocks_duplicate_and_owner_scope(db_session, client_factory):
    owner, _org, _location, space = _owner_space(db_session)
    other_owner, _other_org, _other_location, _other_space = _owner_space(
        db_session,
        owner_email="other-attendance-owner@example.com",
    )
    member = _user(db_session, "scan-member@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    booking = _booking(db_session, member, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=2))
    token = _token_for_booking(db_session, booking)
    owner_client = client_factory(_auth(owner))

    resolved = owner_client.post("/api/access-passes/resolve", json={"token": token})
    assert resolved.status_code == 200
    assert resolved.json()["pass_status"] == "valid"

    checked_in = owner_client.post("/api/access-passes/check-in", json={"token": token})
    assert checked_in.status_code == 200
    assert checked_in.json()["pass_status"] == "already_checked_in"
    duplicate = owner_client.post("/api/access-passes/check-in", json={"token": token})
    assert duplicate.status_code == 409

    current = owner_client.get("/api/attendance/current")
    assert current.status_code == 200
    assert [row["member_email"] for row in current.json()] == [member.email]
    assert db_session.query(SpaceAttendanceRecord).count() == 1

    other_owner_client = client_factory(_auth(other_owner))
    other_current = other_owner_client.get("/api/attendance/current")
    assert other_current.status_code == 200
    assert other_current.json() == []


def test_cancelled_refunded_and_expired_bookings_cannot_check_in(db_session, client_factory):
    owner, _org, _location, space = _owner_space(db_session)
    member = _user(db_session, "blocked-pass@example.com", UserAppRole.MEMBER)
    owner_client = client_factory(_auth(owner))
    now = datetime.now(timezone.utc)

    cancelled = _booking(db_session, member, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=1))
    cancelled_token = _token_for_booking(db_session, cancelled)
    cancelled.status = BookingStatus.CANCELED
    db_session.add(cancelled)
    db_session.commit()
    cancelled_response = owner_client.post("/api/access-passes/check-in", json={"token": cancelled_token})
    assert cancelled_response.status_code == 400
    assert cancelled_response.json()["detail"] == "Pass is cancelled"

    expired = _booking(db_session, member, space, start=now - timedelta(hours=3), end=now - timedelta(hours=1))
    expired_token = _token_for_booking(db_session, expired)
    expired_response = owner_client.post("/api/access-passes/check-in", json={"token": expired_token})
    assert expired_response.status_code == 400
    assert expired_response.json()["detail"] == "Pass is expired"

    refunded = _booking(db_session, member, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=1))
    refunded_token = _token_for_booking(db_session, refunded)
    payment = Payment(
        user_id=member.id,
        booking_id=refunded.id,
        tenant_id=space.tenant_id,
        amount=50,
        amount_cents=5000,
        currency="usd",
        provider="stripe",
        status=PaymentStatus.REFUNDED,
    )
    db_session.add(payment)
    db_session.commit()
    refunded_response = owner_client.post("/api/access-passes/check-in", json={"token": refunded_token})
    assert refunded_response.status_code == 400
    assert refunded_response.json()["detail"] == "Pass is cancelled"


def test_currently_in_office_filter_and_checkout(db_session, client_factory):
    owner, _org, location, space = _owner_space(db_session)
    member = _user(db_session, "checkout-member@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    booking = _booking(db_session, member, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=2))
    token = _token_for_booking(db_session, booking)
    owner_client = client_factory(_auth(owner))
    assert owner_client.get("/api/attendance/locations").json() == [
        {"location_public_id": location.public_id, "location_name": location.name}
    ]
    assert owner_client.post("/api/access-passes/check-in", json={"token": token}).status_code == 200
    assert owner_client.get("/api/attendance?currently_in_office=true").json()["total"] == 1

    checked_out = owner_client.post("/api/access-passes/check-out", json={"token": token})
    assert checked_out.status_code == 200
    assert checked_out.json()["pass_status"] == "checked_out"
    assert owner_client.get("/api/attendance?currently_in_office=true").json()["total"] == 0
    assert owner_client.get("/api/attendance?status=checked_out").json()["total"] == 1


def test_legacy_booking_checkin_creates_attendance_record_and_enforces_pass_window(db_session, client_factory):
    owner, _org, _location, space = _owner_space(db_session)
    member = _user(db_session, "legacy-checkin-member@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    early_booking = _booking(db_session, member, space, start=now + timedelta(hours=1), end=now + timedelta(hours=2))
    active_booking = _booking(db_session, member, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=2))
    _token_for_booking(db_session, early_booking)
    _token_for_booking(db_session, active_booking)
    owner_client = client_factory(_auth(owner))

    early = owner_client.post(f"/api/bookings/{early_booking.public_id}/check-in")
    assert early.status_code == 400
    assert early.json()["detail"] == "Pass is not_yet_valid"

    checked_in = owner_client.post(f"/api/bookings/{active_booking.public_id}/check-in")
    assert checked_in.status_code == 200
    assert db_session.query(SpaceAttendanceRecord).filter(
        SpaceAttendanceRecord.booking_id == active_booking.id,
        SpaceAttendanceRecord.event_type == "check_in",
    ).count() == 1

    checked_out = owner_client.post(f"/api/bookings/{active_booking.public_id}/check-out")
    assert checked_out.status_code == 200
    assert db_session.query(SpaceAttendanceRecord).filter(
        SpaceAttendanceRecord.booking_id == active_booking.id,
        SpaceAttendanceRecord.event_type == "check_out",
    ).count() == 1


def test_member_directory_is_limited_to_other_members_at_same_location(db_session, client_factory):
    _owner, _org, _location, space = _owner_space(db_session)
    _other_owner, _other_org, _other_location, other_space = _owner_space(
        db_session,
        owner_email="directory-other-owner@example.com",
    )
    requester = _user(db_session, "directory-requester@example.com", UserAppRole.MEMBER)
    same_location = _user(db_session, "directory-peer@example.com", UserAppRole.MEMBER)
    subscription_peer = _user(db_session, "directory-subscription@example.com", UserAppRole.MEMBER)
    other_location = _user(db_session, "directory-hidden@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    _booking(db_session, requester, space, start=now - timedelta(days=1), end=now - timedelta(days=1, hours=-1))
    _booking(db_session, same_location, space, start=now - timedelta(days=1), end=now - timedelta(days=1, hours=-1))
    _booking(db_session, other_location, other_space, start=now - timedelta(days=1), end=now - timedelta(days=1, hours=-1))
    db_session.add(
        Subscription(
            user_id=subscription_peer.id,
            space_id=space.id,
            tenant_id=space.tenant_id,
            status="active",
            start_date=now.date() - timedelta(days=10),
            end_date=None,
        )
    )
    db_session.commit()

    requester_client = client_factory(_auth(requester))
    response = requester_client.get("/api/member/directory")

    assert response.status_code == 200
    emails = {row["email"] for row in response.json()}
    assert emails == {same_location.email, subscription_peer.email}


def test_member_directory_filters_and_presence(db_session, client_factory):
    owner, _org, location, space = _owner_space(db_session)
    other_owner, _other_org, other_location, other_space = _owner_space(
        db_session,
        owner_email="directory-filter-owner@example.com",
    )
    requester = _user(db_session, "directory-filter-requester@example.com", UserAppRole.MEMBER)
    online_peer = _user(db_session, "directory-online-peer@example.com", UserAppRole.MEMBER)
    offline_peer = _user(db_session, "directory-offline-peer@example.com", UserAppRole.MEMBER)
    now = datetime.now(timezone.utc)
    _booking(db_session, requester, space, start=now - timedelta(days=1), end=now - timedelta(days=1, hours=-1))
    _booking(db_session, requester, other_space, start=now - timedelta(days=1), end=now - timedelta(days=1, hours=-1))
    online_booking = _booking(db_session, online_peer, space, start=now - timedelta(minutes=5), end=now + timedelta(hours=2))
    _booking(db_session, offline_peer, other_space, start=now - timedelta(minutes=5), end=now + timedelta(hours=2))

    token = _token_for_booking(db_session, online_booking)
    owner_client = client_factory(_auth(owner))
    assert owner_client.post("/api/access-passes/check-in", json={"token": token}).status_code == 200

    requester_client = client_factory(_auth(requester))
    response = requester_client.get("/api/member/directory")

    assert response.status_code == 200
    rows = {row["email"]: row for row in response.json()}
    assert rows[online_peer.email]["is_currently_in_office"] is True
    assert rows[online_peer.email]["checked_in_at"] is not None
    assert rows[offline_peer.email]["is_currently_in_office"] is False
    assert rows[offline_peer.email]["checked_in_at"] is None

    location_response = requester_client.get(f"/api/member/directory?location_public_id={location.public_id}")
    assert {row["email"] for row in location_response.json()} == {online_peer.email}

    other_location_response = requester_client.get(f"/api/member/directory?location_public_id={other_location.public_id}")
    assert {row["email"] for row in other_location_response.json()} == {offline_peer.email}

    search_response = requester_client.get("/api/member/directory?search=offline-peer")
    assert {row["email"] for row in search_response.json()} == {offline_peer.email}

    in_office_response = requester_client.get("/api/member/directory?currently_in_office=true")
    assert {row["email"] for row in in_office_response.json()} == {online_peer.email}

    other_owner_client = client_factory(_auth(other_owner))
    assert other_owner_client.get("/api/attendance/current").json() == []


def test_guest_registration_claims_prior_approved_booking(db_session, client_factory):
    owner, _org, _location, space = _owner_space(db_session)
    _owner_payment_setting(db_session, space)
    guest_client = client_factory({})
    start = datetime(2026, 7, 5, 13, 0, tzinfo=timezone.utc)
    create = guest_client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": start.isoformat(),
            "end_datetime": (start + timedelta(hours=2)).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Guest Member",
            "guest_email": "guest-claim@example.com",
        },
    )
    assert create.status_code == 200
    owner_client = client_factory(_auth(owner))
    approve = owner_client.post(f"/api/booking-requests/{create.json()['public_id']}/approve", json={})
    assert approve.status_code == 200
    assert approve.json()["status"] == BookingRequestStatus.APPROVED.value
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == create.json()["public_id"]).one()
    guest_user = db_session.query(User).filter(User.email == "guest-claim@example.com").one()
    assert req.user_id == guest_user.id
    assert guest_user.password_hash is None

    register = guest_client.post(
        "/auth/register",
        json={
            "email": "guest-claim@example.com",
            "password": "Password123!",
            "first_name": "Guest",
            "last_name": "Member",
            "role": "member",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )
    assert register.status_code == 200
    db_session.refresh(guest_user)
    booking = db_session.query(Booking).filter(Booking.id == req.booking_id).one()
    access_pass = db_session.query(SpaceAccessPass).filter(SpaceAccessPass.booking_id == booking.id).one()
    assert guest_user.password_hash
    assert booking.user_id == guest_user.id
    assert access_pass.user_id == guest_user.id

    member_client = client_factory({"sub": str(guest_user.public_id), "email": guest_user.email, "email_verified": True})
    listed = member_client.get("/api/access-passes")
    assert listed.status_code == 200
    assert [row["booking_public_id"] for row in listed.json()] == [booking.public_id]
