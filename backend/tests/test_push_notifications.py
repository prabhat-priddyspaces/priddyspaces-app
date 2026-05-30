from datetime import datetime, timedelta, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    PaymentStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.location_admin import LocationAdmin
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.push_subscription import PushSubscription
from app.models.space import Space
from app.models.user import User
from app.models.user_notification import UserNotification, UserNotificationPreference
from app.services.push_notifications import BOOKING_END, BOOKING_START, run_booking_reminder_push_job
from app.services.push_notifications import send_push_to_user, upsert_push_subscription


def _auth(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def _user(db, email: str, role: UserAppRole = UserAppRole.MEMBER) -> User:
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


def _org_space(db, *, space_type: SpaceType = SpaceType.CONFERENCE_ROOM, owner_email: str = "push-owner@example.com"):
    owner = _user(db, owner_email, UserAppRole.OWNER)
    org = Organization(name="Push Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Push Location",
        address="1 Main",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Board Room",
        space_type=space_type,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            receives_new_booking_email=True,
            receives_booking_start_push=True,
            receives_booking_end_push=True,
        )
    )
    db.commit()
    return owner, org, location, space


def _booking(db, member: User, space: Space, *, start: datetime, end: datetime) -> Booking:
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=start,
        end_datetime=end,
        status=BookingStatus.CONFIRMED,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def test_notification_preferences_default_and_update(db_session, client_factory):
    member = _user(db_session, "push-member@example.com")
    client = client_factory(_auth(member))

    defaults = client.get("/api/notifications/preferences")
    assert defaults.status_code == 200
    assert defaults.json() == {
        "booking_start_push_enabled": True,
        "booking_end_push_enabled": True,
    }

    updated = client.patch(
        "/api/notifications/preferences",
        json={"booking_end_push_enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["booking_start_push_enabled"] is True
    assert updated.json()["booking_end_push_enabled"] is False


def test_push_subscription_stores_hashed_token_and_can_deactivate(db_session, client_factory):
    member = _user(db_session, "push-subscription@example.com")
    client = client_factory(_auth(member))

    created = client.post(
        "/api/push-subscriptions",
        json={"provider": "expo", "token": "ExponentPushToken[abc]", "device_name": "iPhone"},
    )
    assert created.status_code == 200
    row = db_session.query(PushSubscription).one()
    assert row.endpoint_hash != "ExponentPushToken[abc]"
    assert "ExponentPushToken[abc]" not in row.subscription_encrypted

    deleted = client.delete(f"/api/push-subscriptions/{created.json()['public_id']}")
    assert deleted.status_code == 200
    db_session.refresh(row)
    assert row.is_active is False


def test_invalid_expo_subscription_is_deactivated_after_provider_rejection(db_session, monkeypatch):
    member = _user(db_session, "invalid-push-subscription@example.com")
    subscription = upsert_push_subscription(
        db_session,
        user_id=member.id,
        provider="expo",
        endpoint_or_token="ExponentPushToken[dead]",
        payload={"token": "ExponentPushToken[dead]"},
    )

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "data": {
                    "status": "error",
                    "message": "Device is not registered",
                    "details": {"error": "DeviceNotRegistered"},
                }
            }

    monkeypatch.setattr("app.services.push_notifications.httpx.post", lambda *args, **kwargs: Response())

    status, error = send_push_to_user(
        db_session,
        user_id=member.id,
        title="Reminder",
        body="Body",
        data={},
    )

    assert status == "failed"
    assert "Device" in (error or "")
    db_session.refresh(subscription)
    assert subscription.is_active is False


def test_worker_sends_start_reminder_once_to_member_and_owner_team(db_session, monkeypatch):
    owner, _org, _location, space = _org_space(db_session)
    member = _user(db_session, "start-reminder@example.com")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    booking = _booking(db_session, member, space, start=now + timedelta(minutes=5), end=now + timedelta(hours=1))
    sent: list[int] = []
    monkeypatch.setattr(
        "app.services.push_notifications.send_push_to_user",
        lambda db, user_id, title, body, data: (sent.append(user_id) or ("sent", None)),
    )

    first = run_booking_reminder_push_job(db_session, now=now)
    second = run_booking_reminder_push_job(db_session, now=now)

    assert first["notifications_sent"] == 2
    assert second["notifications_duplicate"] == 2
    rows = db_session.query(UserNotification).filter(UserNotification.booking_id == booking.id).all()
    assert {(row.user_id, row.reminder_type) for row in rows} == {
        (member.id, BOOKING_START),
        (owner.id, BOOKING_START),
    }
    assert sorted(sent) == sorted([member.id, owner.id])


def test_worker_sends_end_reminder_only_for_meeting_rooms(db_session, monkeypatch):
    _owner, _org, _location, conference = _org_space(db_session)
    private_owner, _private_org, _private_location, private_space = _org_space(
        db_session,
        space_type=SpaceType.PRIVATE_OFFICE,
        owner_email="private-push-owner@example.com",
    )
    member = _user(db_session, "end-reminder@example.com")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    conference_booking = _booking(
        db_session,
        member,
        conference,
        start=now - timedelta(hours=1),
        end=now + timedelta(minutes=5),
    )
    _booking(
        db_session,
        member,
        private_space,
        start=now - timedelta(hours=1),
        end=now + timedelta(minutes=5),
    )
    monkeypatch.setattr(
        "app.services.push_notifications.send_push_to_user",
        lambda db, user_id, title, body, data: ("sent", None),
    )

    result = run_booking_reminder_push_job(db_session, now=now)

    assert result["notifications_sent"] >= 1
    rows = db_session.query(UserNotification).filter(UserNotification.reminder_type == BOOKING_END).all()
    assert rows
    assert {row.booking_id for row in rows} == {conference_booking.id}
    assert private_owner.id not in {row.user_id for row in rows}


def test_worker_owner_team_reminders_are_location_scoped(db_session, monkeypatch):
    owner, org, location, space = _org_space(db_session)
    other_location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Other Location",
        address="2 Main",
        timezone="UTC",
    )
    db_session.add(other_location)
    db_session.commit()
    db_session.refresh(other_location)

    assigned_staff = _user(db_session, "assigned-staff-reminder@example.com", UserAppRole.OWNER)
    unassigned_staff = _user(db_session, "unassigned-staff-reminder@example.com", UserAppRole.OWNER)
    for user in [assigned_staff, unassigned_staff]:
        db_session.add(
            OrganizationMember(
                organization_id=org.id,
                tenant_id=org.id,
                user_id=user.id,
                role=UserRole.STAFF,
                receives_booking_start_push=True,
                receives_booking_end_push=True,
            )
        )
    db_session.flush()
    db_session.add_all(
        [
            LocationAdmin(location_id=location.id, user_id=assigned_staff.id, tenant_id=org.id),
            LocationAdmin(location_id=other_location.id, user_id=unassigned_staff.id, tenant_id=org.id),
        ]
    )
    db_session.commit()
    member = _user(db_session, "location-scoped-reminder@example.com")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    booking = _booking(db_session, member, space, start=now + timedelta(minutes=5), end=now + timedelta(hours=1))
    monkeypatch.setattr(
        "app.services.push_notifications.send_push_to_user",
        lambda db, user_id, title, body, data: ("sent", None),
    )

    run_booking_reminder_push_job(db_session, now=now)

    rows = db_session.query(UserNotification).filter(UserNotification.booking_id == booking.id).all()
    notified_user_ids = {row.user_id for row in rows}
    assert owner.id in notified_user_ids
    assert assigned_staff.id in notified_user_ids
    assert unassigned_staff.id not in notified_user_ids


def test_worker_respects_member_and_owner_opt_out_and_skips_invalid_payments(db_session, monkeypatch):
    owner, _org, _location, space = _org_space(db_session)
    org_member = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == owner.id).one()
    org_member.receives_booking_start_push = False
    db_session.add(org_member)
    member = _user(db_session, "opt-out-reminder@example.com")
    db_session.add(
        UserNotificationPreference(
            user_id=member.id,
            booking_start_push_enabled=False,
            booking_end_push_enabled=True,
        )
    )
    now = datetime.now(timezone.utc).replace(microsecond=0)
    booking = _booking(db_session, member, space, start=now + timedelta(minutes=5), end=now + timedelta(hours=1))
    req = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.APPROVED,
        payment_status="succeeded",
    )
    db_session.add(req)
    db_session.flush()
    db_session.add(
        Payment(
            user_id=member.id,
            booking_id=booking.id,
            booking_request_id=req.id,
            tenant_id=space.tenant_id,
            amount=1000,
            status=PaymentStatus.REFUNDED,
        )
    )
    db_session.commit()
    monkeypatch.setattr(
        "app.services.push_notifications.send_push_to_user",
        lambda db, user_id, title, body, data: ("sent", None),
    )

    result = run_booking_reminder_push_job(db_session, now=now)

    assert result["notifications_sent"] == 0
    assert db_session.query(UserNotification).count() == 0
