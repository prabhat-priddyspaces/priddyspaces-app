from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.jwt import issue_token
from app.db.deps import get_db
from app.main import app
from app.core.password import verify_password
from app.models.audit_log import AuditLog
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    LocationStatus,
    OrganizationReviewStatus,
    PlatformTeamRole,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.marketing import OutboundMessage
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


def test_admin_email_health_reports_booking_failures(db_session, client_factory):
    admin = _create_platform_member(db_session, email="email-health-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    _owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.APPROVED)
    outbound = OutboundMessage(
        organization_id=org.id,
        tenant_id=org.id,
        email="customer11@mailinator.com",
        subject="Booking confirmed",
        sender_lane="transactional",
        from_email="no-reply@example.com",
        provider="sendgrid",
        status="failed",
        error="bad sender",
        source="booking",
        source_context={
            "notification_type": "booking_confirmed",
            "booking_request_public_id": "req_123",
        },
    )
    db_session.add(outbound)
    db_session.commit()
    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.get("/api/admin/email-health")

    assert response.status_code == 200
    body = response.json()
    assert body["booking_email_status_counts"]["failed"] == 1
    assert body["recent_booking_failures"][0]["email"] == "customer11@mailinator.com"
    assert body["recent_booking_failures"][0]["error"] == "bad sender"


def test_admin_users_lists_all_user_types_with_filters_and_pagination(db_session, client_factory):
    admin = _create_platform_member(db_session, email="users-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    member = _create_user(db_session, email="member-list@example.com", role=UserAppRole.MEMBER)
    member.full_name = "Member List"
    owner = _create_user(db_session, email="owner-list@example.com", role=UserAppRole.OWNER)
    inactive = _create_user(db_session, email="inactive-list@example.com", role=None)
    inactive.is_active = False
    inactive.email_verified = False
    db_session.commit()

    org = Organization(name="Users Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    db_session.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
        )
    )
    db_session.commit()

    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.get("/api/admin/users?page=1&page_size=2")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 4
    assert data["page"] == 1
    assert data["page_size"] == 2
    assert len(data["results"]) == 2
    assert "auth_subject" not in data["results"][0]
    assert "password_hash" not in data["results"][0]

    search = client.get("/api/admin/users?q=member-list")
    assert search.status_code == 200
    search_data = search.json()
    assert search_data["total"] == 1
    assert search_data["results"][0]["public_id"] == str(member.public_id)
    assert search_data["results"][0]["role"] == "member"

    owner_filter = client.get("/api/admin/users?role=owner")
    assert owner_filter.status_code == 200
    owner_rows = owner_filter.json()["results"]
    assert any(row["public_id"] == str(owner.public_id) and row["organization_count"] == 1 for row in owner_rows)

    platform_filter = client.get("/api/admin/users?role=platform")
    assert platform_filter.status_code == 200
    platform_rows = platform_filter.json()["results"]
    assert any(row["public_id"] == str(admin.public_id) and row["platform_role"] == "superadmin" for row in platform_rows)

    inactive_filter = client.get("/api/admin/users?status=inactive&email_verified=false")
    assert inactive_filter.status_code == 200
    inactive_rows = inactive_filter.json()["results"]
    assert [row["public_id"] for row in inactive_rows] == [str(inactive.public_id)]


def test_admin_users_rejects_non_platform_users_and_invalid_filters(db_session, client_factory):
    member = _create_user(db_session, email="users-forbidden-member@example.com", role=UserAppRole.MEMBER)
    forbidden_client = client_factory({
        "sub": str(member.public_id),
        "email": member.email,
        "email_verified": True,
    })
    forbidden = forbidden_client.get("/api/admin/users")
    assert forbidden.status_code == 403

    admin = _create_platform_member(db_session, email="users-filter-admin@example.com", role=PlatformTeamRole.SUPPORT)
    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })
    invalid_role = client.get("/api/admin/users?role=unknown")
    assert invalid_role.status_code == 400
    invalid_status = client.get("/api/admin/users?status=paused")
    assert invalid_status.status_code == 400


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


def test_superadmin_can_invite_owner_account(db_session, client_factory, monkeypatch):
    sent = []

    def fake_send_email(to_email, subject, body, **_kwargs):
        sent.append({"to_email": to_email, "subject": subject, "body": body})

    monkeypatch.setattr("app.api.admin.send_email", fake_send_email)
    superadmin = _create_platform_member(db_session, email="owner-invite-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })

    response = client.post(
        "/api/admin/owner-invites",
        json={
            "email": "  NewOwner@Example.COM ",
            "first_name": "Nina",
            "last_name": "Owner",
            "phone": "5550001111",
            "company_name": "Nina Works",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "newowner@example.com"
    assert data["role"] == "owner"
    owner = db_session.query(User).filter(User.email == "newowner@example.com").one()
    assert owner.role == UserAppRole.OWNER
    assert owner.full_name == "Nina Owner"
    assert owner.phone == "5550001111"
    assert owner.company_name == "Nina Works"
    assert owner.password_hash is None
    assert sent[0]["to_email"] == "newowner@example.com"
    assert "/owners/sign-up?email=newowner%40example.com&invite=owner" in sent[0]["body"]
    assert "/sign-in?redirect_url=%2Fonboarding%2Fowner" in sent[0]["body"]


def test_owner_invite_rejects_non_superadmin_and_existing_members(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.api.admin.send_email", lambda *args, **kwargs: None)
    admin = _create_platform_member(db_session, email="owner-invite-regular-admin@example.com", role=PlatformTeamRole.ADMIN)
    admin_client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    forbidden = admin_client.post("/api/admin/owner-invites", json={"email": "owner@example.com"})
    assert forbidden.status_code == 403

    superadmin = _create_platform_member(db_session, email="owner-invite-superadmin@example.com", role=PlatformTeamRole.SUPERADMIN)
    member = _create_user(db_session, email="existing-member@example.com", role=UserAppRole.MEMBER)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })

    conflict = client.post("/api/admin/owner-invites", json={"email": member.email})
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == "Existing member accounts cannot be invited as owners"


def test_superadmin_can_update_settings_profile_and_password(db_session, client_factory):
    superadmin = _create_platform_member(db_session, email="settings-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })

    settings = client.get("/api/admin/settings")
    assert settings.status_code == 200
    assert settings.json()["current_admin"]["email"] == superadmin.email
    assert settings.json()["current_admin"]["created_at"] is not None
    assert settings.json()["booking_calendar_daily_prices_enabled"] is False

    platform_settings = client.patch(
        "/api/admin/settings",
        json={"booking_calendar_daily_prices_enabled": True},
    )
    assert platform_settings.status_code == 200
    assert platform_settings.json()["booking_calendar_daily_prices_enabled"] is True

    profile = client.patch(
        "/api/admin/settings/profile",
        json={"first_name": "Ada", "last_name": "Admin"},
    )
    assert profile.status_code == 200
    assert profile.json()["name"] == "Ada Admin"

    password = client.patch(
        "/api/admin/settings/password",
        json={"new_password": "NewPass123!"},
    )
    assert password.status_code == 200
    db_session.refresh(superadmin)
    assert verify_password("NewPass123!", superadmin.password_hash)

    wrong_current = client.patch(
        "/api/admin/settings/password",
        json={"current_password": "wrong", "new_password": "AnotherPass123!"},
    )
    assert wrong_current.status_code == 400


def test_superadmin_can_update_and_remove_platform_team_access(db_session, client_factory):
    superadmin = _create_platform_member(db_session, email="team-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    support = _create_platform_member(db_session, email="support-update@example.com", role=PlatformTeamRole.SUPPORT)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })
    support_member = db_session.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == support.id).one()

    update = client.patch(
        f"/api/admin/platform-team/{support_member.public_id}",
        json={
            "first_name": "Sam",
            "last_name": "Support",
            "role": "admin",
            "is_active": True,
        },
    )
    assert update.status_code == 200
    assert update.json()["name"] == "Sam Support"
    assert update.json()["role"] == "admin"

    delete = client.delete(f"/api/admin/platform-team/{support_member.public_id}")
    assert delete.status_code == 200
    assert db_session.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == support.id).first() is None
    assert db_session.query(User).filter(User.id == support.id).first() is not None


def test_superadmin_cannot_remove_own_platform_access(db_session, client_factory):
    superadmin = _create_platform_member(db_session, email="team-self@example.com", role=PlatformTeamRole.SUPERADMIN)
    client = client_factory({
        "sub": str(superadmin.public_id),
        "email": superadmin.email,
        "email_verified": True,
    })
    member = db_session.query(PlatformTeamMember).filter(PlatformTeamMember.user_id == superadmin.id).one()

    response = client.delete(f"/api/admin/platform-team/{member.public_id}")
    assert response.status_code == 400


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


def test_owner_can_request_org_approval_email(db_session, client_factory, monkeypatch):
    owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.PENDING)
    _superadmin = _create_platform_member(
        db_session,
        email="superadmin-approval@example.com",
        role=PlatformTeamRole.SUPERADMIN,
    )
    sent: list[dict[str, str]] = []

    def fake_send_email(to_email, subject, body, **kwargs):
        sent.append(
            {
                "to_email": to_email,
                "subject": subject,
                "body": body,
                "html_body": kwargs.get("html_body") or "",
            }
        )

    monkeypatch.setattr("app.services.organization_approval.send_email", fake_send_email)
    client = client_factory({
        "sub": str(owner.public_id),
        "email": owner.email,
        "email_verified": True,
    })

    response = client.post(f"/api/orgs/{org.public_id}/approval-request")

    assert response.status_code == 200
    data = response.json()
    assert data["review_status"] == "pending"
    assert data["recipients_notified"] == 1
    assert sent[0]["to_email"] == "superadmin-approval@example.com"
    assert "Owner company approval requested: Org" == sent[0]["subject"]
    assert f"/admin/owner-companies?company={org.public_id}" in sent[0]["body"]
    assert f"/admin/owner-companies?company={org.public_id}&action=approve" in sent[0]["body"]
    audit = db_session.query(AuditLog).filter(AuditLog.action == "organization_approval_requested").one()
    assert audit.entity_public_id == org.public_id


def test_rejected_org_approval_request_resubmits_to_pending(db_session, client_factory, monkeypatch):
    owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.REJECTED)
    org.review_notes = "Missing details"
    db_session.add(org)
    db_session.commit()
    _superadmin = _create_platform_member(
        db_session,
        email="superadmin-resubmit@example.com",
        role=PlatformTeamRole.SUPERADMIN,
    )
    monkeypatch.setattr("app.services.organization_approval.send_email", lambda *args, **kwargs: None)
    client = client_factory({
        "sub": str(owner.public_id),
        "email": owner.email,
        "email_verified": True,
    })

    response = client.post(f"/api/orgs/{org.public_id}/approval-request")

    assert response.status_code == 200
    db_session.refresh(org)
    assert org.review_status == OrganizationReviewStatus.PENDING
    assert org.review_notes is None


def test_approved_org_cannot_request_approval_email(db_session, client_factory):
    owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.APPROVED)
    client = client_factory({
        "sub": str(owner.public_id),
        "email": owner.email,
        "email_verified": True,
    })

    response = client.post(f"/api/orgs/{org.public_id}/approval-request")

    assert response.status_code == 400


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


def test_impersonation_start_infers_owner_role_from_membership(db_session, client_factory):
    admin = _create_platform_member(db_session, email="impersonate-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    owner = _create_user(db_session, email="roleless-owner@example.com", role=None)
    org = Organization(name="Roleless Owner Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    membership = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        is_active=True,
    )
    db_session.add(membership)
    db_session.commit()

    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.post(
        "/api/admin/impersonation/start",
        json={"user_public_id": str(owner.public_id), "reason": "Owner support review"},
    )
    assert response.status_code == 200
    assert response.json()["default_route"] == "/owner"


def test_me_infers_impersonated_owner_role_from_membership(db_session, client_factory):
    admin = _create_platform_member(db_session, email="me-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    owner = _create_user(db_session, email="me-roleless-owner@example.com", role=None)
    org = Organization(name="Me Roleless Owner Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    db_session.add(OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        is_active=True,
    ))
    db_session.commit()
    client = client_factory({
        "sub": str(owner.public_id),
        "actor_sub": str(admin.public_id),
        "email": owner.email,
        "email_verified": True,
        "impersonation_reason": "Owner support review",
    })

    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json()["app_role"] == "owner"
    assert response.json()["default_route"] == "/owner"


def test_impersonation_internal_token_round_trip(db_session):
    admin = _create_platform_member(db_session, email="real-token-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    owner = _create_user(db_session, email="real-token-owner@example.com", role=None)
    org = Organization(name="Real Token Owner Org", owner_id=owner.id, review_status=OrganizationReviewStatus.APPROVED)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)
    db_session.add(OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        is_active=True,
    ))
    db_session.commit()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        admin_token = issue_token(
            str(admin.public_id),
            admin.email,
            admin.role.value if admin.role else None,
            email_verified=True,
        )
        start = client.post(
            "/api/admin/impersonation/start",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"user_public_id": str(owner.public_id), "reason": "Owner support review"},
        )
        assert start.status_code == 200
        start_data = start.json()
        assert start_data["default_route"] == "/owner"

        me = client.get("/api/me", headers={"Authorization": f"Bearer {start_data['access_token']}"})
        assert me.status_code == 200
        me_data = me.json()
        assert me_data["app_role"] == "owner"
        assert me_data["default_route"] == "/owner"
        assert me_data["impersonation"]["is_impersonating"] is True
        assert me_data["impersonation"]["actor_email"] == admin.email
        assert me_data["impersonation"]["target_email"] == owner.email

        stop = client.post(
            "/api/admin/impersonation/stop",
            headers={"Authorization": f"Bearer {start_data['access_token']}"},
        )
        assert stop.status_code == 200
        assert stop.json()["default_route"] == "/admin"
    finally:
        app.dependency_overrides.clear()


def test_admin_booking_activity_includes_member_and_inventory_context(db_session, client_factory):
    admin = _create_platform_member(db_session, email="admin-bookings@example.com", role=PlatformTeamRole.SUPERADMIN)
    member = _create_user(db_session, email="booker@example.com", role=UserAppRole.MEMBER)
    owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.APPROVED)
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Downtown Hub",
        address="123 Main St",
        city="Miami",
        timezone="America/New_York",
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
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    start = datetime.now(timezone.utc).replace(microsecond=0)
    request = BookingRequest(
        tenant_id=org.id,
        user_id=member.id,
        space_id=space.id,
        start_datetime=start,
        end_datetime=start + timedelta(hours=1),
        status=BookingRequestStatus.REQUESTED,
    )
    db_session.add(request)
    db_session.commit()

    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.get("/api/admin/bookings")
    assert response.status_code == 200
    body = response.json()
    assert body["booking_requests"][0]["member_email"] == member.email
    assert body["booking_requests"][0]["space_name"] == "Board Room"
    assert body["booking_requests"][0]["location_name"] == "Downtown Hub"
    assert body["booking_requests"][0]["organization_name"] == org.name


def test_admin_audit_logs_include_readable_labels(db_session, client_factory):
    admin = _create_platform_member(db_session, email="audit-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    _owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.PENDING)
    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    update = client.patch(
        f"/api/admin/owner-companies/{org.public_id}",
        json={"review_status": "approved", "review_notes": "Looks good"},
    )
    assert update.status_code == 200

    response = client.get("/api/admin/audit-logs")
    assert response.status_code == 200
    first = response.json()[0]
    assert first["action_label"] == "Organization review updated"
    assert first["entity_label"] == org.name
    assert first["actor_name"] == admin.email


def test_admin_owner_company_search_matches_public_id(db_session, client_factory):
    admin = _create_platform_member(db_session, email="owner-search-admin@example.com", role=PlatformTeamRole.SUPERADMIN)
    _owner, org = _create_org_owner(db_session, status=OrganizationReviewStatus.PENDING)
    org.display_name = "Searchable Workspace"
    org.industry = "Coworking"
    org.website = "https://workspace.example"
    org.business_email = "approval@workspace.example"
    org.business_phone = "+1 555 0101"
    org.description = "Review-ready owner onboarding detail."
    db_session.add(org)
    db_session.commit()
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Review Hub",
        address="123 Review Ave",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)
    db_session.add(
        Space(
            location_id=location.id,
            tenant_id=org.id,
            space_type=SpaceType.CONFERENCE_ROOM,
            availability_status=AvailabilityStatus.AVAILABLE,
            visibility=SpaceVisibility.PUBLIC,
        )
    )
    db_session.commit()
    client = client_factory({
        "sub": str(admin.public_id),
        "email": admin.email,
        "email_verified": True,
    })

    response = client.get(f"/api/admin/owner-companies?q={org.public_id}")

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["public_id"] == org.public_id
    assert rows[0]["display_name"] == "Searchable Workspace"
    assert rows[0]["industry"] == "Coworking"
    assert rows[0]["website"] == "https://workspace.example"
    assert rows[0]["business_email"] == "approval@workspace.example"
    assert rows[0]["business_phone"] == "+1 555 0101"
    assert rows[0]["description"] == "Review-ready owner onboarding detail."
    assert rows[0]["payment_status"] == "blocked"
    assert rows[0]["payment_provider"] == "stripe"
    assert rows[0]["payment_hidden_listings"] == 1
    assert rows[0]["marketplace_visible_listings"] == 0
    assert rows[0]["payment_blockers"] == ["Stripe payment provider is not configured"]
