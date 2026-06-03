from datetime import datetime, timezone

from app.models.enums import UserAppRole, UserRole, SpaceType, AvailabilityStatus, PlatformTeamRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.location import Location
from app.models.space import Space


def _seed_owner_space(db):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Owner Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        city="Testville",
        timezone="UTC"
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, space


def test_feature_flags_create_and_list(db_session, client_factory):
    owner, org, space = _seed_owner_space(db_session)
    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    flag = client.post(
        "/api/feature-flags",
        json={
            "flag_key": "instant_booking_enabled",
            "flag_value": True,
            "scope_type": "tenant",
            "scope_public_id": org.public_id
        }
    )
    assert flag.status_code == 200

    flags = client.get(f"/api/feature-flags?scope_type=tenant&scope_public_id={org.public_id}")
    assert flags.status_code == 200
    assert len(flags.json()) == 1

    space_flag = client.post(
        "/api/feature-flags",
        json={
            "flag_key": "instant_booking_enabled",
            "flag_value": True,
            "scope_type": "space",
            "scope_public_id": space.public_id
        }
    )
    assert space_flag.status_code == 200


def test_calendar_price_feature_flag_is_superadmin_managed(db_session, client_factory):
    owner, org, _space = _seed_owner_space(db_session)
    owner_client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    owner_flag = owner_client.post(
        "/api/feature-flags",
        json={
            "flag_key": "booking_calendar_daily_prices_enabled",
            "flag_value": True,
            "scope_type": "tenant",
            "scope_public_id": org.public_id
        }
    )
    assert owner_flag.status_code == 403

    superadmin = User(
        email="superadmin@example.com",
        auth_subject="sub-superadmin",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db_session.add(superadmin)
    db_session.commit()
    db_session.refresh(superadmin)
    db_session.add(PlatformTeamMember(user_id=superadmin.id, role=PlatformTeamRole.SUPERADMIN, is_active=True))
    db_session.commit()

    superadmin_client = client_factory({
        "sub": "sub-superadmin",
        "email": superadmin.email,
        "email_verified": True
    })
    superadmin_flag = superadmin_client.post(
        "/api/feature-flags",
        json={
            "flag_key": "booking_calendar_daily_prices_enabled",
            "flag_value": True,
            "scope_type": "tenant",
            "scope_public_id": org.public_id
        }
    )

    assert superadmin_flag.status_code == 200
    assert superadmin_flag.json()["flag_value"] is True
