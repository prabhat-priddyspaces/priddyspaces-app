"""Unit coverage for the extracted booking-request notification helpers (B3).

The full submit/confirm/cancel notification fan-out is exercised through the API
by test_booking_requests.py; this pins the recipient-selection logic that moved
out of app/api/booking_requests.py.
"""

from datetime import time

from app.models.enums import (
    AvailabilityStatus,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.user import User
from app.services.booking_request_notifications import owner_notification_recipients_for_space


def test_owner_notification_recipients_only_includes_opted_in(db_session):
    owner = User(
        email="notif-owner@example.com",
        auth_subject="sub-notif-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    quiet_owner = User(
        email="notif-quiet@example.com",
        auth_subject="sub-notif-quiet",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add_all([owner, quiet_owner])
    db_session.commit()
    db_session.refresh(owner)
    db_session.refresh(quiet_owner)

    org = Organization(name="Notif Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add_all([
        OrganizationMember(
            organization_id=org.id, tenant_id=org.id, user_id=owner.id,
            role=UserRole.OWNER, is_active=True, receives_new_booking_email=True,
        ),
        OrganizationMember(
            organization_id=org.id, tenant_id=org.id, user_id=quiet_owner.id,
            role=UserRole.OWNER, is_active=True, receives_new_booking_email=False,
        ),
    ])
    location = Location(
        organization_id=org.id, tenant_id=org.id, name="Main", address="x",
        timezone="UTC", status=LocationStatus.ACTIVE,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id, tenant_id=org.id, name="Room", space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4, availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0), availability_end_time=time(18, 0),
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    recipients = owner_notification_recipients_for_space(db_session, space)

    emails = [email for email, _role, _uid in recipients]
    assert "notif-owner@example.com" in emails
    assert "notif-quiet@example.com" not in emails


def test_owner_notification_recipients_empty_without_members(db_session):
    owner = User(
        email="notif-solo@example.com", auth_subject="sub-notif-solo",
        role=UserAppRole.OWNER, email_verified=True, is_active=True,
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)
    org = Organization(name="Solo Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    location = Location(
        organization_id=org.id, tenant_id=org.id, name="Main", address="x",
        timezone="UTC", status=LocationStatus.ACTIVE,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)
    space = Space(
        location_id=location.id, tenant_id=org.id, name="Room", space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4, availability_status=AvailabilityStatus.AVAILABLE,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    assert owner_notification_recipients_for_space(db_session, space) == []
