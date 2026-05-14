from datetime import datetime, timezone

from app.models.booking import Booking
from app.models.enums import (
    AvailabilityStatus,
    BookingStatus,
    PaymentStatus,
    PlatformTeamRole,
    SpaceType,
    UserAppRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.payment import Payment
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.user import User


def _create_user(db, email: str, sub: str, role: UserAppRole, *, full_name: str | None = None) -> User:
    user = User(
        email=email,
        auth_subject=sub,
        role=role,
        full_name=full_name,
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_admin_payments_include_member_space_and_location_context(db_session, client_factory):
    admin = _create_user(db_session, "admin-payments@example.com", "sub-admin-payments", UserAppRole.OWNER)
    db_session.add(PlatformTeamMember(user_id=admin.id, role=PlatformTeamRole.SUPERADMIN, is_active=True))
    owner = _create_user(db_session, "owner-payments@example.com", "sub-owner-payments", UserAppRole.OWNER)
    member = _create_user(
        db_session,
        "riley@example.com",
        "sub-riley-payments",
        UserAppRole.MEMBER,
        full_name="Riley Ortiz",
    )
    org = Organization(name="Downtown Cowork", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main Street Hub",
        address="123 Main",
        city="Miami",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Board Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        availability_status=AvailabilityStatus.AVAILABLE,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    booking = Booking(
        user_id=member.id,
        space_id=space.id,
        tenant_id=org.id,
        start_datetime=datetime(2026, 5, 1, 14, 0, tzinfo=timezone.utc),
        end_datetime=datetime(2026, 5, 1, 16, 0, tzinfo=timezone.utc),
        status=BookingStatus.CONFIRMED,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    payment = Payment(
        user_id=member.id,
        booking_id=booking.id,
        tenant_id=org.id,
        amount=120,
        amount_cents=12000,
        provider="stripe",
        provider_payment_id="pi_test_admin",
        status=PaymentStatus.SUCCEEDED,
        commission_rate_pct=10,
        platform_fee_amount=12,
        owner_net_amount=108,
    )
    db_session.add(payment)
    db_session.commit()
    db_session.refresh(payment)

    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })
    response = client.get("/api/admin/payments")
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["gmv"] == 120
    assert data["summary"]["platform_earnings"] == 12
    assert data["summary"]["owner_net"] == 108
    result = data["results"][0]
    assert result["public_id"] == payment.public_id
    assert result["member_name"] == "Riley Ortiz"
    assert result["member_email"] == "riley@example.com"
    assert result["organization_name"] == "Downtown Cowork"
    assert result["booking_public_id"] == booking.public_id
    assert result["space_name"] == "Board Room"
    assert result["space_type"] == "conference_room"
    assert result["location_name"] == "Main Street Hub"
    assert result["location_city"] == "Miami"
