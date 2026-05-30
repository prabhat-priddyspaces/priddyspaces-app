from app import worker
from app.assistant.jobs import match_space_alerts, send_card_expiry_notices
from app.models.assistant import SpaceAlert
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import sessionmaker

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import AvailabilityStatus, BookingRequestStatus, BookingStatus, SpaceType, SpaceVisibility, UserAppRole
from app.models.location import Location
from app.models.marketing import OutboundMessage
from app.models.member_owner_payment_method import MemberOwnerPaymentMethod
from app.models.organization import Organization
from app.models.space import Space
from app.models.user import User
from app.services import notifications
from app.services.booking_email_delivery import BOOKING_EMAIL_CARD_EXPIRING


def test_run_once_isolates_job_failure_and_closes_session(monkeypatch):
    class FakeSession:
        def __init__(self):
            self.closed = False
            self.rolled_back = False

        def rollback(self):
            self.rolled_back = True

        def close(self):
            self.closed = True

    sessions = []

    def session_factory():
        session = FakeSession()
        sessions.append(session)
        return session

    def fail_marketing(_db, *, limit):
        raise RuntimeError(f"boom:{limit}")

    monkeypatch.setattr(worker, "tick_marketing", fail_marketing)
    config = worker.WorkerConfig(
        interval_seconds=60,
        batch_limit=25,
        enable_marketing=True,
        enable_assistant_jobs=False,
        enable_booking_reminder_push=False,
        enable_cardpointe_settlements=False,
        enable_booking_hold_expiry=False,
        cardpointe_max_age_days=7,
    )

    result = worker.run_once(config=config, session_factory=session_factory)

    assert "boom:25" in result["errors"]["marketing"]
    assert sessions[0].rolled_back is True
    assert sessions[0].closed is True


def test_run_once_expires_failed_payment_holds(db_session, monkeypatch):
    user = User(
        email="hold-member@example.com",
        auth_subject="sub-hold-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    org = Organization(name="Hold Org", owner_id=user.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Hold Location",
        address="1 Main",
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
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    booking = Booking(
        user_id=user.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 1, 11, 0, tzinfo=timezone.utc),
        inventory_start_datetime=datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
        inventory_end_datetime=datetime(2026, 5, 1, 11, 0, tzinfo=timezone.utc),
        status=BookingStatus.PENDING,
    )
    db_session.add(booking)
    db_session.flush()
    req = BookingRequest(
        tenant_id=org.id,
        user_id=user.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.PAYMENT_FAILED,
        payment_status="failed",
        payment_hold_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        payment_failed_at=datetime.now(timezone.utc) - timedelta(minutes=31),
    )
    db_session.add(req)
    db_session.commit()

    config = worker.WorkerConfig(
        interval_seconds=60,
        batch_limit=25,
        enable_marketing=False,
        enable_assistant_jobs=False,
        enable_booking_reminder_push=False,
        enable_cardpointe_settlements=False,
        enable_booking_hold_expiry=True,
        cardpointe_max_age_days=7,
    )
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=db_session.get_bind())
    result = worker.run_once(config=config, session_factory=session_factory)

    assert result["jobs"]["booking_hold_expiry"]["expired_payment_holds"] == 1
    db_session.expire_all()
    updated_req = db_session.get(BookingRequest, req.id)
    updated_booking = db_session.get(Booking, booking.id)
    assert updated_req.status == BookingRequestStatus.CANCELLED
    assert updated_booking.status == BookingStatus.CANCELED


def test_run_assistant_jobs_sends_booking_reminder_once(db_session, monkeypatch):
    user = User(
        email="reminder@example.com",
        auth_subject="sub-reminder",
        role=UserAppRole.MEMBER,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    reminder = {
        "kind": "booking_reminder",
        "window": "24h",
        "booking_public_id": "booking-public-id",
        "user_id": user.id,
        "tenant_id": 123,
        "send_at": "2026-05-19T00:00:00+00:00",
    }
    sent = []
    monkeypatch.setattr(worker, "build_booking_reminders", lambda _db: [reminder])
    monkeypatch.setattr(worker, "match_space_alerts", lambda _db: [])
    monkeypatch.setattr(
        worker,
        "send_booking_reminder_email",
        lambda to_email, payload, db=None: sent.append((to_email, payload["booking_public_id"])),
    )

    first = worker.run_assistant_jobs(db_session, limit=100)
    second = worker.run_assistant_jobs(db_session, limit=100)

    assert first["booking_reminders_sent"] == 1
    assert second["booking_reminders_duplicate"] == 1
    assert sent == [("reminder@example.com", "booking-public-id")]
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.source == "assistant").one()
    assert outbound.source_context["kind"] == "booking_reminder"


def test_send_card_expiry_notices_once(db_session, monkeypatch):
    monkeypatch.setattr(notifications.settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(notifications.settings, "SENDGRID_FROM_EMAIL", "")

    owner = User(
        email="card-owner@example.com",
        auth_subject="sub-card-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
    )
    user = User(
        email="card-member@example.com",
        auth_subject="sub-card-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
    )
    db_session.add_all([owner, user])
    db_session.commit()
    db_session.refresh(owner)
    db_session.refresh(user)

    org = Organization(name="Card Notice Org", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    method = MemberOwnerPaymentMethod(
        user_id=user.id,
        organization_id=org.id,
        tenant_id=org.id,
        provider="stripe",
        owner_payment_setting_id=1,
        provider_payment_method_id="pm_card_expiring",
        last4="4242",
        brand="Visa",
        exp_month=6,
        exp_year=2026,
        status="active",
    )
    db_session.add(method)
    db_session.commit()
    db_session.refresh(method)

    first = send_card_expiry_notices(
        db_session,
        now=datetime(2026, 6, 1, tzinfo=timezone.utc),
        limit=100,
    )
    second = send_card_expiry_notices(
        db_session,
        now=datetime(2026, 6, 1, tzinfo=timezone.utc),
        limit=100,
    )

    assert first["card_expiry_notices_sent"] == 1
    assert second["card_expiry_notices_skipped"] == 1
    outbound = (
        db_session.query(OutboundMessage)
        .filter(OutboundMessage.source == "transactional")
        .filter(OutboundMessage.user_id == user.id)
        .one()
    )
    assert outbound.source_context["notification_type"] == BOOKING_EMAIL_CARD_EXPIRING
    assert outbound.source_context["member_owner_payment_method_public_id"] == method.public_id
    assert "4242" in outbound.text_body


def test_match_space_alerts_deactivates_matched_alert(db_session):
    user = User(
        email="alert@example.com",
        auth_subject="sub-alert",
        role=UserAppRole.MEMBER,
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    org = Organization(name="Alert Org", owner_id=user.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Alert HQ",
        address="1 Alert Way",
        city="Miami",
        state="FL",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Alert Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    alert = SpaceAlert(
        user_id=user.id,
        tenant_id=org.id,
        search_filters={"city": "Miami", "space_type": SpaceType.CONFERENCE_ROOM.value, "min_capacity": 4},
        status="active",
        is_active=True,
        notification_count=0,
    )
    db_session.add(alert)
    db_session.commit()
    db_session.refresh(alert)

    matches = match_space_alerts(db_session)

    assert matches[0]["alert_public_id"] == alert.public_id
    db_session.refresh(alert)
    assert alert.status == "matched"
    assert alert.is_active is False
    assert alert.notification_count == 1
