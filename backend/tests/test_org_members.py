from datetime import date, datetime, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    PaymentStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.payment import Payment
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User


def _seed_owner(db, *, email: str = "members-owner@example.com", sub: str = "sub-mem-owner"):
    owner = User(
        email=email,
        auth_subject=sub,
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
        full_name="Members Owner",
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Members Org", owner_id=owner.id)
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
        name="Main",
        address="1 Main",
        city="Anywhere",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Room A",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    return owner, org, location, space


def _seed_user(db, *, email: str, sub: str, name: str = "Member X") -> User:
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


def _owner_token(owner: User) -> dict:
    return {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}


def test_list_members_includes_request_only_lead(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner(db_session)
    member = _seed_user(db_session, email="lead@example.com", sub="sub-lead", name="Lead Person")
    db_session.add(
        BookingRequest(
            tenant_id=space.tenant_id,
            user_id=member.id,
            space_id=space.id,
            start_datetime=datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
            status=BookingRequestStatus.REQUESTED,
        )
    )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    resp = client.get("/api/owner/members")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    item = data[0]
    assert item["user_public_id"] == member.public_id
    assert item["materialized"] is False  # No OrgMemberProfile row written yet.
    assert item["stats"]["open_requests"] == 1
    assert item["stats"]["total_bookings"] == 0


def test_member_detail_lazy_materializes_and_aggregates(db_session, client_factory):
    owner, org, _loc, space = _seed_owner(db_session)
    member = _seed_user(db_session, email="ali@example.com", sub="sub-ali", name="Ali")

    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=space.tenant_id,
        start_datetime=datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    db_session.add(
        Payment(
            user_id=member.id,
            booking_id=booking.id,
            tenant_id=org.id,
            amount=150,
            amount_cents=15000,
            status=PaymentStatus.SUCCEEDED,
            provider="stripe",
        )
    )
    db_session.add(
        Subscription(
            user_id=member.id,
            space_id=space.id,
            tenant_id=org.id,
            status="active",
            start_date=date(2026, 5, 1),
            end_date=None,
        )
    )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    resp = client.get(f"/api/owner/members/{member.public_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["materialized"] is False
    assert data["stats"]["total_bookings"] == 1
    assert data["stats"]["confirmed_bookings"] == 1
    assert data["stats"]["total_revenue_cents"] == 15000
    assert data["stats"]["active_subscriptions"] == 1

    # PATCH lazily creates the OrgMemberProfile row and persists fields.
    resp2 = client.patch(
        f"/api/owner/members/{member.public_id}",
        json={"notes": "Met at event", "tags": ["vip", "design"], "phone": "+1-555"},
    )
    assert resp2.status_code == 200
    body = resp2.json()
    assert body["materialized"] is True
    assert body["notes"] == "Met at event"
    assert body["tags"] == ["vip", "design"]
    assert body["phone"] == "+1-555"

    # Re-fetch returns persisted fields.
    resp3 = client.get(f"/api/owner/members/{member.public_id}")
    assert resp3.status_code == 200
    body3 = resp3.json()
    assert body3["materialized"] is True
    assert body3["tags"] == ["vip", "design"]


def test_member_detail_404_for_unrelated_user(db_session, client_factory):
    owner, _org, _loc, _space = _seed_owner(db_session)
    stranger = _seed_user(db_session, email="stranger@example.com", sub="sub-stranger")
    client = client_factory(_owner_token(owner))
    resp = client.get(f"/api/owner/members/{stranger.public_id}")
    assert resp.status_code == 404


def test_member_role_forbidden_on_members_list(db_session, client_factory):
    member = _seed_user(db_session, email="member-only@example.com", sub="sub-member-only")
    client = client_factory(_owner_token(member))
    resp = client.get("/api/owner/members")
    assert resp.status_code == 403


def test_member_search_filter(db_session, client_factory):
    owner, _org, _loc, space = _seed_owner(db_session)
    a = _seed_user(db_session, email="alpha@example.com", sub="sub-a", name="Alice Apple")
    b = _seed_user(db_session, email="beta@example.com", sub="sub-b", name="Bob Berry")
    for u in [a, b]:
        db_session.add(
            BookingRequest(
                tenant_id=space.tenant_id,
                user_id=u.id,
                space_id=space.id,
                start_datetime=datetime(2026, 6, 1, 10, 0, tzinfo=timezone.utc),
                end_datetime=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
                status=BookingRequestStatus.REQUESTED,
            )
        )
    db_session.commit()

    client = client_factory(_owner_token(owner))
    resp = client.get("/api/owner/members?search=apple")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["user_public_id"] == a.public_id
