from app import worker
from app.assistant.jobs import match_space_alerts
from app.models.assistant import SpaceAlert
from app.models.enums import AvailabilityStatus, SpaceType, SpaceVisibility, UserAppRole
from app.models.location import Location
from app.models.marketing import OutboundMessage
from app.models.organization import Organization
from app.models.space import Space
from app.models.user import User


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
        enable_cardpointe_settlements=False,
        cardpointe_max_age_days=7,
    )

    result = worker.run_once(config=config, session_factory=session_factory)

    assert "boom:25" in result["errors"]["marketing"]
    assert sessions[0].rolled_back is True
    assert sessions[0].closed is True


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
