"""Tests for the extracted booking-request serializer + approval-mode helpers.

`serialize_booking_request_out` and the approval-mode helpers were moved out of
app/api/booking_requests.py (B1). The endpoint tests in test_booking_requests.py
already exercise the serializer through the API; these tests cover the extracted
units directly.
"""

from datetime import datetime, time, timezone

from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestKind,
    BookingRequestStatus,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.user import User
from app.services import booking_approval
from app.services.booking_request_views import serialize_booking_request_out


# --- approval-mode helpers (pure, no DB) -------------------------------------

def test_normalized_approval_mode():
    assert booking_approval.normalized_approval_mode("auto") == "auto"
    assert booking_approval.normalized_approval_mode("manual") == "manual"
    assert booking_approval.normalized_approval_mode("nonsense") == "manual"
    assert booking_approval.normalized_approval_mode(None) == "manual"


def test_org_approval_modes_default_to_manual_without_org():
    assert booking_approval.booking_approval_mode_for_org(None) == "manual"
    assert booking_approval.membership_lease_approval_mode_for_org(None) == "manual"


def test_org_approval_modes_read_org_columns():
    org = Organization(booking_approval_mode="auto", membership_lease_approval_mode="auto")
    assert booking_approval.booking_approval_mode_for_org(org) == "auto"
    assert booking_approval.membership_lease_approval_mode_for_org(org) == "auto"


def test_approval_mode_for_request_uses_instant_flag():
    hourly_instant = BookingRequest(
        request_kind=BookingRequestKind.HOURLY_BOOKING.value, instant_booking=True
    )
    hourly_manual = BookingRequest(
        request_kind=BookingRequestKind.HOURLY_BOOKING.value, instant_booking=False
    )
    membership_instant = BookingRequest(
        request_kind=BookingRequestKind.MEMBERSHIP_PURCHASE.value, instant_booking=True
    )
    assert booking_approval.approval_mode_for_request(hourly_instant, None) == "auto"
    assert booking_approval.approval_mode_for_request(hourly_manual, None) == "manual"
    assert booking_approval.approval_mode_for_request(membership_instant, None) == "auto"


# --- serializer (DB-backed) --------------------------------------------------

def _seed_space(db_session) -> tuple[User, Space]:
    owner = User(
        email="views-owner@example.com",
        auth_subject="sub-views-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
        full_name="Owner Person",
    )
    member = User(
        email="views-member@example.com",
        auth_subject="sub-views-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
        full_name="Vee Member",
    )
    db_session.add_all([owner, member])
    db_session.commit()
    db_session.refresh(owner)
    db_session.refresh(member)

    org = Organization(name="Views Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add(
        OrganizationMember(organization_id=org.id, tenant_id=org.id, user_id=owner.id, role=UserRole.OWNER)
    )
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Boardroom",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        price_hourly=40,
        price_daily=300,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0),
        availability_end_time=time(18, 0),
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    return member, space


def test_serialize_booking_request_out_maps_core_fields(db_session):
    member, space = _seed_space(db_session)
    start = datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc)
    end = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
    req = BookingRequest(
        tenant_id=space.tenant_id,
        space_id=space.id,
        user_id=member.id,
        start_datetime=start,
        end_datetime=end,
        request_kind=BookingRequestKind.HOURLY_BOOKING.value,
        status=BookingRequestStatus.REQUESTED,
    )
    db_session.add(req)
    db_session.commit()
    db_session.refresh(req)

    out = serialize_booking_request_out(req, space, None, db_session)

    assert out.public_id == req.public_id
    assert out.space_public_id == space.public_id
    assert out.space_name == "Boardroom"
    assert out.space_type == SpaceType.CONFERENCE_ROOM.value
    assert out.member_email == "views-member@example.com"
    assert out.member_name == "Vee Member"
    assert out.request_kind == BookingRequestKind.HOURLY_BOOKING
    assert out.status == BookingRequestStatus.REQUESTED
    # 2 hours x $40/hr = $80 base (no rule/discount configured).
    assert out.base_amount_cents == 8000
    # Support contacts include the active owner.
    assert any(c.title == "Owner" for c in out.support_contacts)


def test_serialize_booking_request_out_tolerates_missing_db_and_space():
    req = BookingRequest(
        space_id=1,
        start_datetime=datetime(2026, 7, 1, 10, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc),
        request_kind=BookingRequestKind.HOURLY_BOOKING.value,
        status=BookingRequestStatus.REQUESTED,
        public_id="req_public_x",
    )
    out = serialize_booking_request_out(req, None, None, None)
    assert out.public_id == "req_public_x"
    assert out.space_name is None
    assert out.support_contacts == []
