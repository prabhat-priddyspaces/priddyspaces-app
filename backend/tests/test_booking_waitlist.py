from datetime import date, datetime, time, timezone

import pytest
from pydantic import ValidationError

from app.models.booking import Booking
from app.models.booking_waitlist import BookingWaitlistEntry
from app.models.enums import (
    AvailabilityStatus,
    BookingStatus,
    BookingWaitlistStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.booking_request import BookingRequestCreate
from app.services.space_availability import get_space_availability


def _seed(db, *, waitlist_enabled: bool = True):
    owner = User(
        email="owner@test.com",
        auth_subject="wait-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    member = User(
        email="customer@test.com",
        auth_subject="wait-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    other = User(
        email="other@test.com",
        auth_subject="wait-other",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db.add_all([owner, member, other])
    db.commit()
    db.refresh(owner)
    db.refresh(member)
    db.refresh(other)

    org = Organization(
        name="Waitlist Org",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
        waitlist_enabled=waitlist_enabled,
        waitlist_conference_room_enabled=waitlist_enabled,
        waitlist_private_office_enabled=waitlist_enabled,
        waitlist_shared_desk_enabled=waitlist_enabled,
        waitlist_suite_enabled=waitlist_enabled,
        waitlist_virtual_office_enabled=waitlist_enabled,
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
        name="Main",
        address="123 Main",
        city="Austin",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Focus Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0),
        availability_end_time=time(17, 0),
        visibility=SpaceVisibility.PUBLIC,
        price_hourly=50,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, member, other, org, location, space


def _token(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def test_member_can_join_waitlist_for_unavailable_slot_and_owner_invites(db_session, client_factory):
    owner, member, other, _org, _location, space = _seed(db_session)
    start = datetime(2026, 6, 10, 14, 0, tzinfo=timezone.utc)
    end = datetime(2026, 6, 10, 15, 0, tzinfo=timezone.utc)
    db_session.add(
        Booking(
            user_id=other.id,
            space_id=space.id,
            tenant_id=space.tenant_id,
            start_datetime=start,
            end_datetime=end,
            inventory_start_datetime=start,
            inventory_end_datetime=end,
            status=BookingStatus.CONFIRMED,
        )
    )
    db_session.commit()

    member_client = client_factory(_token(member))
    response = member_client.post(
        "/api/booking-waitlist",
        json={
            "space_public_id": space.public_id,
            "start_datetime": start.isoformat(),
            "end_datetime": end.isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "seats_requested": 1,
        },
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == BookingWaitlistStatus.WAITLISTED.value
    assert data["space_public_id"] == space.public_id

    owner_client = client_factory(_token(owner))
    invite = owner_client.post(
        f"/api/booking-waitlist/{data['public_id']}/invite",
        json={"operator_notes": "Opening may work after cleanup."},
    )
    assert invite.status_code == 200, invite.text
    invited = invite.json()
    assert invited["status"] == BookingWaitlistStatus.INVITED.value
    assert invited["booking_href"].startswith(f"/spaces/{space.public_id}?")
    assert "waitlist=" in invited["booking_href"]

    member_list = member_client.get("/api/booking-waitlist")
    assert member_list.status_code == 200
    assert member_list.json()[0]["status"] == BookingWaitlistStatus.INVITED.value


def test_waitlist_rejects_available_slot(db_session, client_factory):
    _owner, member, _other, _org, _location, space = _seed(db_session)
    client = client_factory(_token(member))
    response = client.post(
        "/api/booking-waitlist",
        json={
            "space_public_id": space.public_id,
            "start_datetime": "2026-06-11T14:00:00+00:00",
            "end_datetime": "2026-06-11T15:00:00+00:00",
            "booking_mode": "hourly",
            "full_day": False,
            "seats_requested": 1,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "This slot is currently available; book it instead"


def test_waitlist_rejects_disabled_matching_space_type(db_session, client_factory):
    _owner, member, other, org, _location, space = _seed(db_session)
    org.waitlist_conference_room_enabled = False
    org.waitlist_private_office_enabled = True
    org.waitlist_enabled = True
    start = datetime(2026, 6, 10, 14, 0, tzinfo=timezone.utc)
    end = datetime(2026, 6, 10, 15, 0, tzinfo=timezone.utc)
    db_session.add_all(
        [
            org,
            Booking(
                user_id=other.id,
                space_id=space.id,
                tenant_id=space.tenant_id,
                start_datetime=start,
                end_datetime=end,
                inventory_start_datetime=start,
                inventory_end_datetime=end,
                status=BookingStatus.CONFIRMED,
            ),
        ]
    )
    db_session.commit()

    client = client_factory(_token(member))
    response = client.post(
        "/api/booking-waitlist",
        json={
            "space_public_id": space.public_id,
            "start_datetime": start.isoformat(),
            "end_datetime": end.isoformat(),
            "booking_mode": "hourly",
            "full_day": False,
            "seats_requested": 1,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "This owner has not enabled waitlists for this space type"


def _add_unavailable_plan(
    db,
    *,
    org: Organization,
    location: Location,
    space_type: SpaceType,
    booking_mode: str,
    subscriber: User,
) -> tuple[Space, MembershipPlan]:
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name=f"{space_type.value} waitlist space",
        space_type=space_type,
        capacity=2,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    db.add(space)
    db.commit()
    db.refresh(space)

    plan = MembershipPlan(
        tenant_id=org.id,
        organization_id=org.id,
        space_id=space.id,
        booking_mode=booking_mode,
        name=f"{booking_mode} plan",
        price_cents=100_00,
        billing_cycle="monthly",
        commitment_months=1,
        seats_per_plan=1,
        max_active_subscriptions=1,
        is_active=True,
    )
    db.add_all(
        [
            plan,
            SpaceBookingMode(
                tenant_id=org.id,
                space_id=space.id,
                booking_mode=booking_mode,
                is_enabled=True,
            ),
        ]
    )
    db.commit()
    db.refresh(plan)

    db.add(
        Subscription(
            user_id=subscriber.id,
            space_id=space.id,
            tenant_id=org.id,
            membership_plan_id=plan.id,
            status="active",
            start_date=date(2026, 6, 1),
            end_date=date(2026, 7, 1),
            booking_mode=booking_mode,
        )
    )
    db.commit()
    return space, plan


@pytest.mark.parametrize(
    ("space_type", "booking_mode", "flag_name"),
    [
        (SpaceType.PRIVATE_OFFICE, "private_office_lease", "waitlist_private_office_enabled"),
        (SpaceType.SUITE, "suite_lease", "waitlist_suite_enabled"),
        (SpaceType.SHARED_DESK, "monthly_membership", "waitlist_shared_desk_enabled"),
        (SpaceType.VIRTUAL_OFFICE, "virtual_membership", "waitlist_virtual_office_enabled"),
    ],
)
def test_member_can_join_plan_waitlist_when_matching_space_type_enabled(
    db_session,
    client_factory,
    space_type,
    booking_mode,
    flag_name,
):
    _owner, member, other, org, location, _space = _seed(db_session, waitlist_enabled=False)
    setattr(org, flag_name, True)
    org.waitlist_enabled = True
    db_session.add(org)
    db_session.commit()
    _plan_space, plan = _add_unavailable_plan(
        db_session,
        org=org,
        location=location,
        space_type=space_type,
        booking_mode=booking_mode,
        subscriber=other,
    )

    client = client_factory(_token(member))
    response = client.post(
        "/api/booking-waitlist",
        json={
            "membership_plan_public_id": plan.public_id,
            "desired_start_date": "2026-06-15",
            "seats_requested": 1,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["membership_plan_public_id"] == plan.public_id
    assert response.json()["booking_mode"] == booking_mode


def test_plan_waitlist_rejects_disabled_matching_space_type(db_session, client_factory):
    _owner, member, other, org, location, _space = _seed(db_session, waitlist_enabled=False)
    org.waitlist_conference_room_enabled = True
    org.waitlist_enabled = True
    db_session.add(org)
    db_session.commit()
    _plan_space, plan = _add_unavailable_plan(
        db_session,
        org=org,
        location=location,
        space_type=SpaceType.PRIVATE_OFFICE,
        booking_mode="private_office_lease",
        subscriber=other,
    )

    client = client_factory(_token(member))
    response = client.post(
        "/api/booking-waitlist",
        json={
            "membership_plan_public_id": plan.public_id,
            "desired_start_date": "2026-06-15",
            "seats_requested": 1,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "This owner has not enabled waitlists for this space type"


def test_waitlist_entries_do_not_block_availability(db_session):
    _owner, member, _other, org, location, space = _seed(db_session)
    db_session.add(
        BookingWaitlistEntry(
            tenant_id=org.id,
            organization_id=org.id,
            location_id=location.id,
            space_id=space.id,
            user_id=member.id,
            request_kind="hourly_booking",
            booking_mode="hourly",
            start_datetime=datetime(2026, 6, 12, 14, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 6, 12, 15, 0, tzinfo=timezone.utc),
            status=BookingWaitlistStatus.WAITLISTED.value,
        )
    )
    db_session.commit()

    days = get_space_availability(
        db_session,
        space_id=space.id,
        location_timezone=location.timezone,
        start_date=datetime(2026, 6, 12, tzinfo=timezone.utc).date(),
        end_date=datetime(2026, 6, 12, tzinfo=timezone.utc).date(),
        availability_start_time=space.availability_start_time,
        availability_end_time=space.availability_end_time,
        space_type=space.space_type.value,
        space_capacity=space.capacity,
    )

    assert days[0]["date"] == "2026-06-12"
    assert days[0]["fully_blocked"] is False
    assert days[0]["busy_intervals"] == []


def test_waitlist_invite_cannot_be_used_for_recurring_request():
    with pytest.raises(ValidationError, match="Waitlist invites can only be used for a single booking request"):
        BookingRequestCreate(
            space_public_id="space_1",
            start_datetime="2026-06-12T14:00:00+00:00",
            end_datetime="2026-06-12T15:00:00+00:00",
            source_waitlist_public_id="wait_1",
            recurrence={"frequency": "weekly", "count": 2},
        )
