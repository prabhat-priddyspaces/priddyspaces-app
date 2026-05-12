from sqlalchemy import text

from app.core.password import verify_password
from app.models.enums import OrganizationReviewStatus, PlatformTeamRole, SpaceType, SpaceVisibility, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.user import User
from app.services.platform_auth import bootstrap_first_superadmin


def _create_user(db_session, *, email: str, role: UserAppRole | None = None) -> User:
    user = User(
        email=email,
        auth_subject=f"sub-{email}",
        role=role,
        email_verified=True,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _create_org_owner(db_session, *, status: OrganizationReviewStatus) -> tuple[User, Organization]:
    owner = _create_user(db_session, email="owner@example.com", role=UserAppRole.OWNER)
    org = Organization(name="Org", owner_id=owner.id, review_status=status)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    )
    db_session.add(member)
    db_session.commit()
    return owner, org


def _create_platform_member(db_session, *, email: str, role: PlatformTeamRole) -> User:
    user = _create_user(db_session, email=email, role=UserAppRole.OWNER)
    member = PlatformTeamMember(user_id=user.id, role=role, is_active=True)
    db_session.add(member)
    db_session.commit()
    return user


def test_bootstrap_first_superadmin_is_idempotent(db_session):
    user, member, created = bootstrap_first_superadmin(db_session, email="root@example.com")
    assert created is True
    again_user, again_member, created_again = bootstrap_first_superadmin(db_session, email="root@example.com")
    assert created_again is False
    assert again_user.id == user.id
    assert again_member.id == member.id


def test_bootstrap_first_superadmin_can_set_password(db_session):
    user, _member, created = bootstrap_first_superadmin(
        db_session,
        email="root-with-password@example.com",
        password="TempPass123!",
    )
    assert created is True
    assert user.password_hash
    assert verify_password("TempPass123!", user.password_hash)


def test_platform_enums_store_lowercase_values(db_session):
    owner = _create_user(db_session, email="enum-owner@example.com", role=UserAppRole.OWNER)
    org = Organization(name="Enum Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    member = PlatformTeamMember(user_id=owner.id, role=PlatformTeamRole.SUPERADMIN, is_active=True)
    db_session.add(member)
    db_session.commit()

    stored_user_role = db_session.execute(
        text("SELECT role FROM users WHERE id = :user_id"),
        {"user_id": owner.id},
    ).scalar_one()
    stored_review_status = db_session.execute(
        text("SELECT review_status FROM organizations WHERE id = :org_id"),
        {"org_id": org.id},
    ).scalar_one()
    stored_platform_role = db_session.execute(
        text("SELECT role FROM platform_team_members WHERE user_id = :user_id"),
        {"user_id": owner.id},
    ).scalar_one()

    assert stored_user_role == "owner"
    assert stored_review_status == "approved"
    assert stored_platform_role == "superadmin"


def test_me_returns_platform_role_and_admin_default_route(db_session, client_factory):
    admin = _create_platform_member(db_session, email="admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.get("/api/me")
    assert response.status_code == 200
    data = response.json()
    assert data["platform_role"] == "superadmin"
    assert data["default_route"] == "/admin"


def test_superadmin_can_invite_platform_team_member_but_admin_cannot(db_session, client_factory):
    superadmin = _create_platform_member(db_session, email="superadmin@example.com", role=PlatformTeamRole.SUPERADMIN)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })

    response = client.post("/api/admin/platform-team", json={"email": "support@example.com", "role": "support"})
    assert response.status_code == 200
    assert response.json()["role"] == "support"

    admin = _create_platform_member(db_session, email="admin@example.com", role=PlatformTeamRole.ADMIN)
    admin_client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })
    forbidden = admin_client.post("/api/admin/platform-team", json={"email": "other@example.com", "role": "support"})
    assert forbidden.status_code == 403


def test_pending_org_hidden_from_marketplace_and_member_access(db_session, client_factory):
    _owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.PENDING)
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="HQ",
        address="123 Main St",
        city="New York",
        timezone="America/New_York",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Desk 1",
        space_type=SpaceType.SHARED_DESK,
        capacity=1,
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()

    public_client = client_factory({"sub": "anon", "email": "anon@example.com", "email_verified": True})
    marketplace = public_client.get("/api/marketplace/search")
    assert marketplace.status_code == 200
    assert marketplace.json() == []

    member = _create_user(db_session, email="member@example.com", role=UserAppRole.MEMBER)
    member_client = client_factory({
        "sub": str(member.public_id),
        "email": member.email,
        "email_verified": True,
    })
    hidden = member_client.get(f"/api/locations/{location.public_id}")
    assert hidden.status_code == 404


def test_rejected_org_owner_can_resubmit(db_session, client_factory):
    owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.REJECTED)
    org.review_notes = "Missing KYB docs"
    db_session.add(org)
    db_session.commit()

    client = client_factory({
        "sub": str(owner.public_id),
        "email": owner.email,
        "email_verified": True,
    })
    response = client.patch(
        f"/api/orgs/{org.public_id}",
        json={"name": "Org Updated", "resubmit_for_review": True},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Org Updated"
    assert data["review_status"] == "pending"


def test_impersonation_stop_uses_actor_platform_role(db_session, client_factory):
    admin = _create_platform_member(db_session, email="admin@example.com", role=PlatformTeamRole.ADMIN)
    member = _create_user(db_session, email="member@example.com", role=UserAppRole.MEMBER)
    client = client_factory({
        "sub": str(member.public_id),
        "actor_sub": str(admin.public_id),
        "email": member.email,
        "email_verified": True,
        "impersonation_reason": "Support review",
    })

    response = client.post("/api/admin/impersonation/stop")
    assert response.status_code == 200
    assert response.json()["default_route"] == "/admin"
