from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

from app.models.booking import Booking
from app.models.enums import (
    AvailabilityStatus,
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


def _seed_customer(db, *, email: str = "c@example.com", sub: str = "sub-c", name: str = "Cust") -> User:
    user = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.CUSTOMER,
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
    cust = _seed_customer(db_session)

    db_session.add_all([
        Booking(
            user_id=cust.id, space_id=space1.id, tenant_id=org1.id,
            start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Booking(
            user_id=cust.id, space_id=space2.id, tenant_id=org2.id,
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


def test_admin_customer_orgs_returns_per_org_stats(db_session, client_factory):
    _o1, org1, _l1, space1 = _seed_org_with_space(db_session, owner_email="ox@example.com", owner_sub="sub-ox", name="X")
    _o2, org2, _l2, space2 = _seed_org_with_space(db_session, owner_email="oy@example.com", owner_sub="sub-oy", name="Y")
    cust = _seed_customer(db_session)
    db_session.add_all([
        Booking(
            user_id=cust.id, space_id=space1.id, tenant_id=org1.id,
            start_datetime=datetime(2026, 5, 5, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 5, 5, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        ),
        Subscription(
            user_id=cust.id, space_id=space2.id, tenant_id=org2.id,
            status="active", start_date=date(2026, 5, 1),
        ),
    ])
    db_session.commit()

    admin = _seed_platform_admin(db_session)
    client = client_factory(_token(admin))
    resp = client.get(f"/api/admin/customers/{cust.public_id}/orgs")
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
    me = _seed_customer(db_session, email="me@example.com", sub="sub-me", name="Me")
    other = _seed_customer(db_session, email="other@example.com", sub="sub-other", name="Other")
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


def test_me_calendar_empty_when_no_bookings(db_session, client_factory):
    me = _seed_customer(db_session, email="me2@example.com", sub="sub-me2")
    client = client_factory(_token(me))
    start = datetime(2026, 5, 4, 0, 0, tzinfo=timezone.utc)
    end = start + timedelta(days=7)
    resp = client.get(f"/api/me/calendar?{_qs(start, end)}")
    assert resp.status_code == 200
    assert resp.json()["events"] == []


def test_me_patch_updates_phone_and_company(db_session, client_factory):
    me = _seed_customer(db_session, email="patch-me@example.com", sub="sub-patch-me")
    client = client_factory(_token(me))
    resp = client.patch("/api/me", json={"phone": "+1-555-0100", "company_name": "Acme Corp"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == "+1-555-0100"
    assert body["company_name"] == "Acme Corp"

    resp_get = client.get("/api/me")
    assert resp_get.status_code == 200
    assert resp_get.json()["phone"] == "+1-555-0100"
    assert resp_get.json()["company_name"] == "Acme Corp"
