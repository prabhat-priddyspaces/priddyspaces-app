from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    PlatformTeamRole,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User


def _seed_org_with_space(db, *, owner_email: str, owner_sub: str, name: str = "Org") -> tuple[User, Organization, Location, Space]:
    owner = User(
        email=owner_email,
        auth_subject=owner_sub,
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
        full_name=f"{name} Owner",
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)
    org = Organization(name=name, owner_id=owner.id)
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
        name=f"{name} Loc",
        address="1 St",
        city="City",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name=f"{name} Room",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, location, space


def _seed_platform_admin(db, *, email: str = "platform@example.com", sub: str = "sub-platform") -> User:
    user = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(PlatformTeamMember(user_id=user.id, role=PlatformTeamRole.ADMIN, is_active=True))
    db.commit()
    return user


def _seed_member(db, *, email: str = "c@example.com", sub: str = "sub-c", name: str = "Member") -> User:
    user = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        full_name=name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _qs(start: datetime, end: datetime, **extra: str) -> str:
    parts = [f"start={quote(start.isoformat())}", f"end={quote(end.isoformat())}"]
    for k, v in extra.items():
        parts.append(f"{k}={quote(v)}")
    return "&".join(parts)


def _token(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def test_admin_calendar_spans_all_orgs_when_unscoped(db_session, client_factory):
    _o1, org1, _l1, space1 = _seed_org_with_space(db_session, owner_email="o1@example.com", owner_sub="sub-o1", name="OrgA")
    _o2, org2, _l2, space2 = _seed_org_with_space(db_session, owner_email="o2@example.com", owner_sub="sub-o2", name="OrgB")
    member = _seed_member(db_session)

    db_session.add_all([
        Booking(
            user_id=member.id, space_id=space1.id, tenant_id=org1.id,
            start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Booking(
            user_id=member.id, space_id=space2.id, tenant_id=org2.id,
            start_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 13, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
    ])
    db_session.commit()

    admin = _seed_platform_admin(db_session)
    client = client_factory(_token(admin))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/admin/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["events"]) == 2  # both orgs visible

    # Scoping by organization filters to one org's events.
    resp_scoped = client.get(
        f"/api/admin/calendar?{_qs(start, end, organization_public_id=org1.public_id)}"
    )
    assert resp_scoped.status_code == 200
    assert len(resp_scoped.json()["events"]) == 1


def test_admin_calendar_requires_platform_admin(db_session, client_factory):
    owner, _org, _loc, _space = _seed_org_with_space(db_session, owner_email="own@example.com", owner_sub="sub-own")
    client = client_factory(_token(owner))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    resp = client.get(f"/api/admin/calendar?{_qs(start, end)}")
    assert resp.status_code == 403


def test_admin_member_orgs_returns_per_org_stats(db_session, client_factory):
    _o1, org1, _l1, space1 = _seed_org_with_space(db_session, owner_email="ox@example.com", owner_sub="sub-ox", name="X")
    _o2, org2, _l2, space2 = _seed_org_with_space(db_session, owner_email="oy@example.com", owner_sub="sub-oy", name="Y")
    member = _seed_member(db_session)
    db_session.add_all([
        Booking(
            user_id=member.id, space_id=space1.id, tenant_id=org1.id,
            start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Subscription(
            user_id=member.id, space_id=space2.id, tenant_id=org2.id,
            status="active", start_date=date(2026, 5, 1),
        ),
    ])
    db_session.commit()

    admin = _seed_platform_admin(db_session)
    client = client_factory(_token(admin))
    resp = client.get(f"/api/admin/members/{member.public_id}/orgs")
    assert resp.status_code == 200
    items = resp.json()
    org_ids = {item["organization_public_id"] for item in items}
    assert org1.public_id in org_ids
    assert org2.public_id in org_ids
    org1_item = next(i for i in items if i["organization_public_id"] == org1.public_id)
    assert org1_item["stats"]["confirmed_bookings"] == 1
    org2_item = next(i for i in items if i["organization_public_id"] == org2.public_id)
    assert org2_item["stats"]["active_subscriptions"] == 1


def test_me_calendar_shows_only_own_bookings(db_session, client_factory):
    _owner, org, _loc, space = _seed_org_with_space(db_session, owner_email="ow@example.com", owner_sub="sub-ow")
    me = _seed_member(db_session, email="me@example.com", sub="sub-me", name="Me")
    other = _seed_member(db_session, email="other@example.com", sub="sub-other", name="Other")
    db_session.add_all([
        Booking(
            user_id=me.id, space_id=space.id, tenant_id=org.id,
            start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Booking(
            user_id=other.id, space_id=space.id, tenant_id=org.id,
            start_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 13, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
    ])
    db_session.commit()

    client = client_factory(_token(me))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/me/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    events = resp.json()["events"]
    assert len(events) == 1
    assert events[0]["member"]["public_id"] == me.public_id


def test_me_calendar_limits_spaces_to_own_activity_and_filters_location(db_session, client_factory):
    _owner, org, loc_a, space_a = _seed_org_with_space(
        db_session,
        owner_email="own-spaces@example.com",
        owner_sub="sub-own-spaces",
        name="Mine",
    )
    other_space_same_location = Space(
        location_id=loc_a.id,
        tenant_id=org.id,
        name="Other Member Room",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=2,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=120,
    )
    loc_b = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Mine Second Loc",
        address="2 St",
        city="City",
        timezone="UTC",
    )
    db_session.add_all([other_space_same_location, loc_b])
    db_session.commit()
    db_session.refresh(other_space_same_location)
    db_session.refresh(loc_b)
    space_b = Space(
        location_id=loc_b.id,
        tenant_id=org.id,
        name="Mine Second Room",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=2,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=120,
    )
    db_session.add(space_b)
    db_session.commit()
    db_session.refresh(space_b)

    me = _seed_member(db_session, email="mine@example.com", sub="sub-mine", name="Mine")
    other = _seed_member(db_session, email="not-mine@example.com", sub="sub-not-mine", name="Not Mine")
    db_session.add_all([
        Booking(
            user_id=me.id, space_id=space_a.id, tenant_id=org.id,
            start_datetime=datetime(2026, 5, 5, 9, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Booking(
            user_id=me.id, space_id=space_b.id, tenant_id=org.id,
            start_datetime=datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 13, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Booking(
            user_id=other.id, space_id=other_space_same_location.id, tenant_id=org.id,
            start_datetime=datetime(2026, 5, 5, 14, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 15, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
    ])
    db_session.commit()

    client = client_factory(_token(me))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/me/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    data = resp.json()
    assert {space["public_id"] for space in data["spaces"]} == {space_a.public_id, space_b.public_id}
    assert {event["space_public_id"] for event in data["events"]} == {space_a.public_id, space_b.public_id}

    resp_loc = client.get(
        f"/api/me/calendar?{_qs(start, end, location_public_id=loc_a.public_id)}"
    )
    assert resp_loc.status_code == 200
    loc_data = resp_loc.json()
    assert [space["public_id"] for space in loc_data["spaces"]] == [space_a.public_id]
    assert [event["space_public_id"] for event in loc_data["events"]] == [space_a.public_id]


def test_me_calendar_includes_own_pending_requests_without_prior_booking(db_session, client_factory):
    _owner, org, _loc, space = _seed_org_with_space(
        db_session,
        owner_email="request-owner@example.com",
        owner_sub="sub-request-owner",
        name="RequestOrg",
    )
    me = _seed_member(db_session, email="request-me@example.com", sub="sub-request-me", name="Request Me")
    db_session.add(
        BookingRequest(
            tenant_id=org.id,
            user_id=me.id,
            space_id=space.id,
            start_datetime=datetime(2026, 5, 5, 9, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            status=BookingRequestStatus.REQUESTED,
        )
    )
    db_session.commit()

    client = client_factory(_token(me))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/me/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    data = resp.json()
    assert [space_item["public_id"] for space_item in data["spaces"]] == [space.public_id]
    assert len(data["events"]) == 1
    assert data["events"][0]["kind"] == "request"
    assert data["events"][0]["status"] == "request.requested"


def test_me_calendar_empty_when_no_bookings(db_session, client_factory):
    me = _seed_member(db_session, email="me2@example.com", sub="sub-me2")
    client = client_factory(_token(me))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/me/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_me_patch_updates_phone_and_company(db_session, client_factory):
    me = _seed_member(db_session, email="patch-me@example.com", sub="sub-patch-me")
    client = client_factory(_token(me))
    resp = client.patch("/api/me", json={"phone": "+1-555-0100", "company_name": "Acme Corp"})
    assert resp.status_code == 200
    body = resp.json()
    # Phone is normalized to digits only, capped at 10.
    assert body["phone"] == "15550100"
    assert body["company_name"] == "Acme Corp"

    resp_get = client.get("/api/me")
    assert resp_get.status_code == 200
    assert resp_get.json()["phone"] == "15550100"
    assert resp_get.json()["company_name"] == "Acme Corp"
