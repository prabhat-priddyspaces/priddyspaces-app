from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User


def _seed_owner_with_space(db, *, space_type: SpaceType = SpaceType.CONFERENCE_ROOM):
    owner = User(
        email="cal-owner@example.com",
        auth_subject="sub-cal-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Cal Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
        )
    )

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Cal Location",
        address="1 Calendar Ave",
        city="Testville",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Room 101",
        space_type=space_type,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, location, space


def _seed_member(db, email: str = "cal-member@example.com", sub: str = "sub-cal-member") -> User:
    user = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        full_name="Cal Member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _owner_token(owner: User) -> dict:
    return {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}


def _window(days: int = 7):
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=days)
    return start, end


def _qs(start: datetime, end: datetime, **extra: str) -> str:
    parts = [f"start={quote(start.isoformat())}", f"end={quote(end.isoformat())}"]
    for k, v in extra.items():
        parts.append(f"{k}={quote(v)}")
    return "&".join(parts)


def test_calendar_returns_booking_event(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["truncated"] is False
    assert len(data["spaces"]) == 1
    assert data["spaces"][0]["public_id"] == space.public_id
    assert data["spaces"][0]["capacity"] == 4
    events = data["events"]
    assert len(events) == 1
    ev = events[0]
    assert ev["kind"] == "booking"
    assert ev["status"] == "booking.confirmed"
    assert ev["space_public_id"] == space.public_id
    assert ev["member"]["public_id"] == member.public_id
    assert ev["member"]["name"] == "Cal Member"


def test_calendar_filters_by_organization_public_id_for_multi_org_owner(db_session, client_factory):
    owner, org_a, _loc_a, space_a = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)

    org_b = Organization(name="Second Cal Org", owner_id=owner.id)
    db_session.add(org_b)
    db_session.commit()
    db_session.refresh(org_b)
    db_session.add(
        OrganizationMember(
            organization_id=org_b.id,
            tenant_id=org_b.id,
            user_id=owner.id,
            role=UserRole.OWNER,
        )
    )
    loc_b = Location(
        organization_id=org_b.id,
        tenant_id=org_b.id,
        name="Second Location",
        address="2 Calendar Ave",
        city="Testville",
        timezone="UTC",
    )
    db_session.add(loc_b)
    db_session.commit()
    db_session.refresh(loc_b)
    space_b = Space(
        location_id=loc_b.id,
        tenant_id=org_b.id,
        name="Room 202",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db_session.add(space_b)
    db_session.commit()
    db_session.refresh(space_b)

    db_session.add_all(
        [
            Booking(
                user_id=member.id,
                space_id=space_a.id,
                tenant_id=org_a.id,
                start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
                end_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
                status=BookingStatus.CONFIRMED,
            ),
            Booking(
                user_id=member.id,
                space_id=space_b.id,
                tenant_id=org_b.id,
                start_datetime=datetime(2026, 5, 6, 10, 0, tzinfo=timezone.utc),
                end_datetime=datetime(2026, 5, 6, 12, 0, tzinfo=timezone.utc),
                status=BookingStatus.CONFIRMED,
            ),
        ]
    )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(
        f"/api/owner/calendar?{_qs(start, end, organization_public_id=org_a.public_id)}"
    )

    assert resp.status_code == 200
    data = resp.json()
    assert [space["public_id"] for space in data["spaces"]] == [space_a.public_id]
    assert [event["space_public_id"] for event in data["events"]] == [space_a.public_id]


def test_calendar_filters_to_member_and_allows_full_member_window(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session, email="member-a@example.com", sub="sub-member-a")
    other = _seed_member(db_session, email="member-b@example.com", sub="sub-member-b")
    db_session.add_all(
        [
            Booking(
                user_id=member.id,
                space_id=space.id,
                tenant_id=space.tenant_id,
                start_datetime=datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc),
                end_datetime=datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc),
                status=BookingStatus.CONFIRMED,
            ),
            Booking(
                user_id=other.id,
                space_id=space.id,
                tenant_id=space.tenant_id,
                start_datetime=datetime(2026, 6, 16, 10, 0, tzinfo=timezone.utc),
                end_datetime=datetime(2026, 6, 16, 12, 0, tzinfo=timezone.utc),
                status=BookingStatus.CONFIRMED,
            ),
        ]
    )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=60)
    resp = client.get(
        f"/api/owner/calendar?{_qs(start, end, member_public_id=member.public_id)}"
    )

    assert resp.status_code == 200
    data = resp.json()
    events = data["events"]
    assert len(events) == 1
    assert events[0]["member"]["public_id"] == member.public_id
    assert events[0]["start"].startswith("2026-06-15")


def test_calendar_excludes_approved_request_to_avoid_double_render(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    approved = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        booking_id=booking.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.APPROVED,
    )
    pending = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 5, 6, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 6, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.REQUESTED,
    )
    db_session.add_all([approved, pending])
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    events = resp.json()["events"]
    kinds = sorted(e["kind"] for e in events)
    # 1 booking + 1 pending request, NO duplicate from the approved request.
    assert kinds == ["booking", "request"]
    request_event = next(e for e in events if e["kind"] == "request")
    assert request_event["status"] == "request.requested"


def test_calendar_suppresses_pending_hold_when_request_represents_slot(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)
    request = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
        status=BookingRequestStatus.REQUESTED,
        seats_requested=2,
    )
    db_session.add(request)
    db_session.flush()
    booking_hold = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        booking_request_id=request.id,
        start_datetime=request.start_datetime,
        end_datetime=request.end_datetime,
        status=BookingStatus.PENDING,
    )
    db_session.add(booking_hold)
    db_session.flush()
    request.booking_id = booking_hold.id
    db_session.add(request)
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")

    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 1
    assert events[0]["kind"] == "request"
    assert events[0]["status"] == "request.requested"
    assert events[0]["seats_requested"] == 2


def test_calendar_suppresses_pending_request_covered_by_confirmed_booking(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    duplicate_request = BookingRequest(
        tenant_id=space.tenant_id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=booking.start_datetime,
        end_datetime=booking.end_datetime,
        status=BookingRequestStatus.REQUESTED,
    )
    db_session.add_all([booking, duplicate_request])
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")

    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 1
    assert events[0]["kind"] == "booking"
    assert events[0]["status"] == "booking.confirmed"


def test_subscription_emits_block_for_private_office_only(db_session, client_factory):
    owner, _org, _loc, office = _seed_owner_with_space(
        db_session, space_type=SpaceType.PRIVATE_OFFICE
    )
    member = _seed_member(db_session)
    sub = Subscription(
        user_id=member.id,
        space_id=office.id,
        tenant_id=office.tenant_id,
        status="active",
        start_date=date(2026, 5, 1),
        end_date=None,
    )
    db_session.add(sub)
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 1
    assert events[0]["kind"] == "subscription"
    assert events[0]["status"] == "subscription.active"


def test_subscription_does_not_emit_block_for_meeting_room(db_session, client_factory):
    owner, _org, _loc, room = _seed_owner_with_space(db_session, space_type=SpaceType.CONFERENCE_ROOM)
    member = _seed_member(db_session)
    sub = Subscription(
        user_id=member.id,
        space_id=room.id,
        tenant_id=room.tenant_id,
        status="active",
        start_date=date(2026, 5, 1),
        end_date=None,
    )
    db_session.add(sub)
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_calendar_authz_blocks_other_org(db_session, client_factory):
    owner_a, _org_a, loc_a, _space_a = _seed_owner_with_space(db_session)

    other_owner = User(
        email="other-owner@example.com",
        auth_subject="sub-other",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(other_owner)
    db_session.commit()
    db_session.refresh(other_owner)
    other_org = Organization(name="Other Org", owner_id=other_owner.id)
    db_session.add(other_org)
    db_session.commit()
    db_session.refresh(other_org)
    db_session.add(
        OrganizationMember(
            organization_id=other_org.id,
            tenant_id=other_org.id,
            user_id=other_owner.id,
            role=UserRole.OWNER,
        )
    )
    other_location = Location(
        organization_id=other_org.id,
        tenant_id=other_org.id,
        name="Other Location",
        address="2 Other St",
        city="Otherville",
        timezone="UTC",
    )
    db_session.add(other_location)
    db_session.commit()

    client = client_factory(_owner_token(other_owner))
    start, end = _window()
    # Pointing at owner_a's location is rejected with 404 even though other_owner has their own loc.
    resp = client.get(
        f"/api/owner/calendar?{_qs(start, end, location_public_id=loc_a.public_id)}"
    )
    assert resp.status_code == 404


def test_calendar_clamps_window_to_max(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner_with_space(db_session)
    member = _seed_member(db_session)
    # Booking 40 days from window start — outside the clamped 35-day window.
    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 6, 13, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 6, 13, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()

    client = client_factory(_owner_token(owner))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=60)
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    data = resp.json()
    # Returned `end` is clamped to ≤ 35 days from start; the 40-day-out booking is excluded.
    assert data["events"] == []


def test_member_role_forbidden(db_session, client_factory):
    member = _seed_member(db_session)
    client = client_factory(_owner_token(member))
    start, end = _window()
    resp = client.get(f"/api/owner/calendar?{_qs(start, end)}")
    assert resp.status_code == 403
