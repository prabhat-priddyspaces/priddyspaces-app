from app.models.organization import Organization
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User
from app.models.enums import PlatformTeamRole, UserAppRole


def test_admin_metrics(db_session, client_factory):
    user = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()

    org = Organization(name="Org", owner_id=user.id)
    db_session.add(org)
    db_session.commit()

    admin = User(
        email="admin@example.com",
        auth_subject="sub-admin",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)

    member = PlatformTeamMember(
        user_id=admin.id,
        role=PlatformTeamRole.SUPERADMIN,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()

    client = client_factory({
        "sub": str(admin.public_id),
        "email": "admin@example.com",
        "email_verified": True
    })
    resp = client.get("/api/admin/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tenants"] == 1
    assert data["users"] == 2
