from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.core.config import settings
from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus, BookingRequestStatus, BookingStatus
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.location_admin import LocationAdmin
from app.models.location import Location
from app.models.space import Space
from app.models.booking_request import BookingRequest
from app.models.booking import Booking
from app.models.audit_log import AuditLog
from app.models.booking_series import BookingSeries
from app.models.owner_payment_setting import OwnerPaymentSetting
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.marketing import OutboundMessage
from app.services.payment_providers import ChargeResult
from app.api.booking_requests import _owner_notification_emails_for_space


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
        can_override_pricing=True,
        receives_new_booking_email=True,
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


def _seed_payment_method(db, member: User, space: Space) -> MemberOwnerPaymentMethod:
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
    method = MemberOwnerPaymentMethod(
        user_id=member.id,
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


def _booking_outbounds(db, req_id: str, notification_type: str | None = None):
    rows = db.query(OutboundMessage).filter(OutboundMessage.source == "booking").all()
    rows = [
        row
        for row in rows
        if (row.source_context or {}).get("booking_request_public_id") == req_id
    ]
    if notification_type:
        rows = [
            row
            for row in rows
            if (row.source_context or {}).get("notification_type") == notification_type
        ]
    return rows


def _mock_sendgrid(monkeypatch):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    response = MagicMock()
    response.status_code = 202
    response.text = ""
    response.headers = {"X-Message-Id": "sg-message"}
    sent: list[dict] = []

    def fake_post(*args, **kwargs):
        sent.append(kwargs["json"])
        return response

    monkeypatch.setattr("app.services.notifications.httpx.post", fake_post)
    return sent


def _request_payload(space: Space, method: MemberOwnerPaymentMethod | None, day: int = 10):
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 3, day, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 3, day, 12, 0, tzinfo=timezone.utc).isoformat(),
        "payment_authorization_consent": True,
    }
    if method:
        payload["member_owner_payment_method_public_id"] = method.public_id
    return payload


def test_booking_request_create_and_list(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).first()
    owner.full_name = "Olivia Owner"
    space.name = "Board Room"
    location.public_phone = "(555) 010-2026"
    location.public_email = "frontdesk@example.com"
    location.state = "TX"
    location.postal_code = "78701"
    db_session.add_all([owner, space, location])
    db_session.commit()
    member = User(
        email="member@example.com",
        auth_subject="sub-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member",
        "email": "member@example.com",
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 1, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.REQUESTED.value
    assert data["estimated_amount"] is not None
    assert data["created_at"] is not None
    assert data["space_name"] == "Board Room"
    assert data["space_type"] == SpaceType.CONFERENCE_ROOM.value
    assert data["location_public_id"] == location.public_id
    assert data["location_name"] == "Main"
    assert data["location_address"] == "123 Main"
    assert data["location_city"] == "Testville"
    assert data["location_state"] == "TX"
    assert data["location_postal_code"] == "78701"
    assert data["location_timezone"] == "UTC"
    assert data["location_public_phone"] == "(555) 010-2026"
    assert data["location_public_email"] == "frontdesk@example.com"
    assert data["support_contacts"] == [{"name": "Olivia Owner", "title": "Owner"}]

    listing = member_client.get("/api/booking-requests")
    assert listing.status_code == 200
    listed = listing.json()
    assert len(listed) == 1
    assert listed[0]["created_at"] == data["created_at"]
    assert listed[0]["space_name"] == "Board Room"
    assert listed[0]["support_contacts"] == [{"name": "Olivia Owner", "title": "Owner"}]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    assert len(owner_list.json()) == 1
    owner_request = owner_list.json()[0]
    assert owner_request["member_email"] == "member@example.com"
    assert owner_request["space_public_id"] == space.public_id
    assert owner_request["location_name"] == "Main"


def test_owner_notification_recipients_require_opt_in_and_location_access(db_session):
    owner, space = _seed_owner_space(db_session)
    location = db_session.query(Location).filter(Location.id == space.location_id).first()
    org_id = location.organization_id

    admin = User(
        email="admin-recipient@example.com",
        auth_subject="sub-admin-recipient",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    staff = User(
        email="staff-recipient@example.com",
        auth_subject="sub-staff-recipient",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    opted_out = User(
        email="opted-out@example.com",
        auth_subject="sub-opted-out",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    no_access = User(
        email="no-access@example.com",
        auth_subject="sub-no-access",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([admin, staff, opted_out, no_access])
    db_session.commit()

    db_session.add_all(
        [
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=admin.id,
                role=UserRole.ADMIN,
                receives_new_booking_email=True,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=staff.id,
                role=UserRole.STAFF,
                receives_new_booking_email=True,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=opted_out.id,
                role=UserRole.ADMIN,
                receives_new_booking_email=False,
            ),
            OrganizationMember(
                organization_id=org_id,
                tenant_id=org_id,
                user_id=no_access.id,
                role=UserRole.STAFF,
                receives_new_booking_email=True,
            ),
            LocationAdmin(location_id=location.id, tenant_id=org_id, user_id=admin.id),
            LocationAdmin(location_id=location.id, tenant_id=org_id, user_id=staff.id),
        ]
    )
    db_session.commit()

    assert _owner_notification_emails_for_space(db_session, space) == [
        "admin-recipient@example.com",
        "owner@example.com",
        "staff-recipient@example.com",
    ]


def test_booking_request_submission_records_requester_and_owner_email_attempts(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="submitted-member@example.com",
        auth_subject="sub-submitted-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=2))

    assert create.status_code == 200
    req_id = create.json()["public_id"]
    submitted = _booking_outbounds(db_session, req_id, "request_submitted")
    owner_notices = _booking_outbounds(db_session, req_id, "owner_booking_request")
    assert len(submitted) == 1
    assert submitted[0].email == member.email
    assert submitted[0].status == "failed"
    assert submitted[0].source_context["diagnostic"] == "sendgrid_not_configured"
    assert len(owner_notices) == 1
    assert owner_notices[0].email == owner.email

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    owner_list = owner_client.get("/api/booking-requests?status=requested")
    assert owner_list.status_code == 200
    summary = owner_list.json()[0]["email_delivery_summary"]
    assert {item["notification_type"] for item in summary} >= {"request_submitted", "owner_booking_request"}
    assert any(item["status"] == "failed" for item in summary)


def test_booking_transactional_email_bypasses_unsubscribe(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="unsubscribed-booking@example.com",
        auth_subject="sub-unsubscribed-booking",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        email_unsubscribed_at=datetime.now(timezone.utc),
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=3))

    assert create.status_code == 200
    assert any(
        payload["personalizations"][0]["to"][0]["email"] == member.email
        for payload in sent
    )


def test_booking_email_sendgrid_failure_records_failed_outbound(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    response = MagicMock()
    response.status_code = 400
    response.text = "bad sender"
    response.headers = {}
    monkeypatch.setattr("app.services.notifications.httpx.post", lambda *args, **kwargs: response)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="bad-sendgrid@example.com",
        auth_subject="sub-bad-sendgrid",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })

    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=7))

    assert create.status_code == 200
    req_id = create.json()["public_id"]
    submitted = _booking_outbounds(db_session, req_id, "request_submitted")
    assert submitted[0].status == "failed"
    assert "bad sender" in submitted[0].error


def test_booking_email_resend_endpoint_creates_new_attempt(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="resend-member@example.com",
        auth_subject="sub-resend-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=6))
    req_id = create.json()["public_id"]
    assert len(_booking_outbounds(db_session, req_id, "request_submitted")) == 1

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    resend = owner_client.post(
        f"/api/booking-requests/{req_id}/emails/resend",
        json={"notification_type": "request_submitted"},
    )

    assert resend.status_code == 200
    attempts = _booking_outbounds(db_session, req_id, "request_submitted")
    assert len(attempts) == 2
    assert any((attempt.source_context or {}).get("resend") is True for attempt in attempts)


def test_sendgrid_webhook_updates_booking_outbound(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="booking-webhook@example.com",
        auth_subject="sub-booking-webhook",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=8))
    req_id = create.json()["public_id"]
    outbound_public_id = sent[0]["personalizations"][0]["custom_args"]["outbound_public_id"]
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.public_id == outbound_public_id).one()

    response = member_client.post(
        "/api/webhooks/sendgrid",
        json=[
            {
                "event": "delivered",
                "email": member.email,
                "sg_event_id": "evt-booking-delivered",
                "outbound_public_id": outbound.public_id,
            }
        ],
    )

    assert response.status_code == 200
    db_session.refresh(outbound)
    assert outbound.status == "delivered"
    assert _booking_outbounds(db_session, req_id, "request_submitted")[0].status == "delivered"


def test_guest_booking_request_survives_notification_failure(db_session, client_factory, monkeypatch):
    _owner, space = _seed_owner_space(db_session)

    def fail_notification(*args, **kwargs):
        raise RuntimeError("email service unavailable")

    monkeypatch.setattr(
        "app.api.booking_requests.send_booking_request_submitted_email",
        fail_notification,
    )
    monkeypatch.setattr(
        "app.api.booking_requests._notify_owner_team_of_request",
        fail_notification,
    )

    client = client_factory({})
    resp = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 13, 13, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 13, 14, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
            "guest_phone": "1231231234",
            "guest_company_name": "test",
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == BookingRequestStatus.REQUESTED.value
    req = db_session.query(BookingRequest).filter(BookingRequest.public_id == body["public_id"]).one()
    assert req.is_guest_checkout is True
    assert req.user_id is None
    assert req.guest_email == "testi@mailinator.com"


def test_guest_booking_request_rejects_rewards_redemption(db_session, client_factory):
    _owner, space = _seed_owner_space(db_session)

    client = client_factory({})
    resp = client.post(
        "/api/guest/booking-requests",
        json={
            "space_public_id": space.public_id,
            "start_datetime": datetime(2026, 5, 14, 13, 0, tzinfo=timezone.utc).isoformat(),
            "end_datetime": datetime(2026, 5, 14, 14, 0, tzinfo=timezone.utc).isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "guest_full_name": "Test User",
            "guest_email": "testi@mailinator.com",
            "redemption_lock_public_id": "lock_1",
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Rewards redemption requires a member account"


def test_booking_request_approve_creates_booking(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust2@example.com",
        auth_subject="sub-member-2",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member-2",
        "email": member.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 2, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
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
    assert approved["approved_at"] is not None

    booking = db_session.query(Booking).filter(Booking.id == approved["booking_id"]).first()
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED


def test_booking_request_approval_sends_one_calendar_email_and_audits_actor(
    db_session,
    client_factory,
    monkeypatch,
):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    sent = _mock_sendgrid(monkeypatch)
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="calendar-member@example.com",
        auth_subject="sub-calendar-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=4))
    assert create.status_code == 200
    req_id = create.json()["public_id"]
    sent.clear()

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    approve = owner_client.post(f"/api/booking-requests/{req_id}/approve", json={"operator_notes": "ok"})
    assert approve.status_code == 200

    confirmed = [email for email in sent if email["subject"] == "Booking confirmed"]
    assert len(confirmed) == 1
    assert confirmed[0]["personalizations"][0]["to"][0]["email"] == member.email
    assert len(confirmed[0]["attachments"]) == 1
    attachment = confirmed[0]["attachments"][0]
    assert attachment["filename"].endswith(".ics")
    assert "text/calendar" in attachment["type"]
    assert confirmed[0]["personalizations"][0]["custom_args"]["outbound_public_id"]

    outbounds = _booking_outbounds(db_session, req_id, "booking_confirmed")
    assert len(outbounds) == 1
    assert outbounds[0].email == member.email
    assert outbounds[0].status == "sent"
    assert outbounds[0].source_context["recipient_role"] == "member"

    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_public_id == req_id)
        .order_by(AuditLog.created_at.desc())
        .first()
    )
    assert audit is not None
    assert audit.action == "booking_request_approved"
    assert audit.actor_id == owner.id
    assert audit.context["actor_email"] == owner.email


def test_booking_request_reject(db_session, client_factory):
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust3@example.com",
        auth_subject="sub-member-3",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

    member_client = client_factory({
        "sub": "sub-member-3",
        "email": member.email,
        "email_verified": True
    })

    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 3, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 3, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    req_id = create.json()["public_id"]

    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200
    assert reject.json()["status"] == BookingRequestStatus.REJECTED.value
    assert reject.json()["rejected_at"] is not None


def test_booking_request_rejection_sends_update_without_calendar_attachment(
    db_session,
    client_factory,
    monkeypatch,
):
    sent = _mock_sendgrid(monkeypatch)
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="reject-member@example.com",
        auth_subject="sub-reject-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": member.auth_subject,
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, day=5))
    assert create.status_code == 200
    req_id = create.json()["public_id"]
    sent.clear()

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    reject = owner_client.post(f"/api/booking-requests/{req_id}/reject", json={"operator_notes": "no"})
    assert reject.status_code == 200

    updates = [email for email in sent if email["subject"] == "Booking request update"]
    assert len(updates) == 1
    assert updates[0]["personalizations"][0]["to"][0]["email"] == member.email
    assert "attachments" not in updates[0]
    outbounds = _booking_outbounds(db_session, req_id, "booking_rejected")
    assert len(outbounds) == 1
    assert outbounds[0].email == member.email


def test_instant_booking_flag_auto_approves(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust4@example.com",
        auth_subject="sub-member-4",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)

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

    member_client = client_factory({
        "sub": "sub-member-4",
        "email": member.email,
        "email_verified": True
    })
    payload = {
        "space_public_id": space.public_id,
        "start_datetime": datetime(2026, 2, 4, 10, 0, tzinfo=timezone.utc).isoformat(),
        "end_datetime": datetime(2026, 2, 4, 12, 0, tzinfo=timezone.utc).isoformat(),
        "member_owner_payment_method_public_id": method.public_id,
        "payment_authorization_consent": True,
    }
    create = member_client.post("/api/booking-requests", json=payload)
    assert create.status_code == 200
    data = create.json()
    assert data["status"] == BookingRequestStatus.APPROVED.value
    assert data["booking_id"] is not None


def test_explicit_instant_booking_confirms_and_blocks_overlap(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="instant@example.com",
        auth_subject="sub-instant",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-instant",
        "email": member.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 13)
    payload["booking_mode"] = "hourly"

    create = member_client.post("/api/booking-requests", json=payload)
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
    assert summary.json()["gross_cents"] == 10000

    overlap = member_client.post("/api/booking-requests", json=payload)
    assert overlap.status_code == 409, overlap.text


def test_recurring_instant_booking_creates_confirmed_series(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FakeProvider())
    _owner, space = _seed_owner_space(db_session)
    member = User(
        email="recurring@example.com",
        auth_subject="sub-recurring",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-recurring",
        "email": member.email,
        "email_verified": True,
    })
    payload = _request_payload(space, method, 14)
    payload["booking_mode"] = "hourly"
    payload["recurrence"] = {"frequency": "weekly", "interval": 1, "count": 3}

    create = member_client.post("/api/booking-requests", json=payload)
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
    member = User(
        email="cust5@example.com",
        auth_subject="sub-member-5",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    db_session.add(OwnerPaymentSetting(
        organization_id=space.tenant_id,
        tenant_id=space.tenant_id,
        provider="stripe",
        is_enabled=True,
        stripe_publishable_key="pk_test_owner",
        stripe_secret_key_encrypted="sk_test_owner",
    ))
    db_session.commit()

    member_client = client_factory({
        "sub": "sub-member-5",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, None, 5))
    assert create.status_code == 400
    assert "Payment method is required" in create.text


def test_payment_failure_marks_request_payment_failed(db_session, client_factory, monkeypatch):
    class FailingProvider:
        def charge_saved_method(self, **kwargs):
            return ChargeResult(status="failed", failure_reason="declined", raw_response={"resp": "declined"})

    monkeypatch.setattr("app.services.booking_payments.PaymentProviderFactory.get", lambda setting: FailingProvider())
    owner, space = _seed_owner_space(db_session)
    member = User(
        email="cust6@example.com",
        auth_subject="sub-member-6",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-6",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 6))
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
    member = User(
        email="cust7@example.com",
        auth_subject="sub-member-7",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-7",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 7))
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
    member = User(
        email="cust8@example.com",
        auth_subject="sub-member-8",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    db_session.refresh(member)
    method = _seed_payment_method(db_session, member, space)
    member_client = client_factory({
        "sub": "sub-member-8",
        "email": member.email,
        "email_verified": True,
    })
    create = member_client.post("/api/booking-requests", json=_request_payload(space, method, 8))
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
