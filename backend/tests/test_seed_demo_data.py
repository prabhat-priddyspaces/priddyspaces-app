from app.core.password import verify_password
from app.models.enums import PlatformTeamRole, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.user import User
from app.seed_demo_data import DEMO_ORGS, DEMO_SUPERADMIN, seed_demo_data


def test_seed_demo_data_uses_clerk_valid_demo_accounts(db_session):
    legacy_owner = User(
        email="owner.nyc@priddyspaces.demo",
        first_name="Legacy",
        last_name="Owner",
        role=UserAppRole.OWNER,
    )
    db_session.add(legacy_owner)
    db_session.commit()
    db_session.refresh(legacy_owner)
    legacy_org = Organization(
        name="Legacy Invalid Demo Org",
        owner_id=legacy_owner.id,
    )
    db_session.add(legacy_org)
    db_session.commit()
    db_session.refresh(legacy_org)
    legacy_location = Location(
        organization_id=legacy_org.id,
        tenant_id=legacy_org.id,
        name="Legacy Location",
        address="1 Legacy Way",
        timezone="America/New_York",
    )
    db_session.add(legacy_location)
    db_session.commit()
    db_session.refresh(legacy_location)
    legacy_space = Space(
        location_id=legacy_location.id,
        tenant_id=legacy_org.id,
        name="Legacy Desk",
        space_type=SpaceType.SHARED_DESK,
    )
    db_session.add_all(
        [
            legacy_space,
            OrganizationMember(
                organization_id=legacy_org.id,
                tenant_id=legacy_org.id,
                user_id=legacy_owner.id,
                role=UserRole.OWNER,
            ),
        ]
    )
    db_session.commit()

    counts = seed_demo_data(db_session, owner_password="Password123!")

    expected_locations = sum(len(org["locations"]) for org in DEMO_ORGS)
    expected_spaces = sum(
        len(location["spaces"])
        for org in DEMO_ORGS
        for location in org["locations"]
    )
    assert counts == {
        "superadmins": 1,
        "owners": len(DEMO_ORGS),
        "organizations": len(DEMO_ORGS),
        "locations": expected_locations,
        "spaces": expected_spaces,
    }

    admin = db_session.query(User).filter(User.email == DEMO_SUPERADMIN["email"]).one()
    assert admin.email == "adminpriddyspaces@mailinator.com"
    assert admin.email_verified is True
    assert verify_password("Password123!", admin.password_hash)
    platform_member = (
        db_session.query(PlatformTeamMember)
        .filter(PlatformTeamMember.user_id == admin.id)
        .one()
    )
    assert platform_member.role == PlatformTeamRole.SUPERADMIN
    assert platform_member.is_active is True

    owner_emails = [org["owner"]["email"] for org in DEMO_ORGS]
    assert all(email.endswith("@mailinator.com") for email in owner_emails)
    assert db_session.query(User).filter(User.email.like("%@priddyspaces.demo")).count() == 0
    assert (
        db_session.query(Organization).filter(Organization.name == "Legacy Invalid Demo Org").count()
        == 0
    )
    assert db_session.query(Location).filter(Location.name == "Legacy Location").count() == 0
    assert db_session.query(Space).filter(Space.name == "Legacy Desk").count() == 0
    for email in owner_emails:
        owner = db_session.query(User).filter(User.email == email).one()
        assert owner.role == UserAppRole.OWNER
        assert owner.email_verified is True
        assert verify_password("Password123!", owner.password_hash)
