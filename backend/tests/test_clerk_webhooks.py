"""Tests for the Clerk webhook handler and onboarding API."""
from __future__ import annotations

import json
import time
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.webhooks_clerk import (
    _handle_membership_deleted,
    _handle_membership_upsert,
    _handle_org_deleted,
    _handle_org_upsert,
    _handle_user_deleted,
    _handle_user_upsert,
)
from app.core.auth import get_current_user
from app.db.deps import get_db
from app.main import app
from app.models.enums import OrganizationReviewStatus, PlatformTeamRole, UserAppRole
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User


# ──────────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def anon_client(db_session: Session) -> TestClient:
    """TestClient with DB overridden but NO auth override — simulates unauthenticated call."""
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # Deliberately do NOT override get_current_user
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _make_user_data(
    clerk_id: str = "user_test1",
    email: str = "alice@example.com",
    first_name: str = "Alice",
    last_name: str = "Smith",
    role: str | None = None,
    platform_role: str | None = None,
) -> dict:
    primary_id = "ea_primary"
    return {
        "id": clerk_id,
        "first_name": first_name,
        "last_name": last_name,
        "primary_email_address_id": primary_id,
        "email_addresses": [
            {
                "id": primary_id,
                "email_address": email,
                "verification": {"status": "verified"},
            }
        ],
        "public_metadata": {
            **({"role": role} if role else {}),
            **({"platform_role": platform_role} if platform_role else {}),
        },
    }


# ──────────────────────────────────────────────────────────────────────────────
# Webhook handler unit tests (bypass HTTP / signature layer)
# ──────────────────────────────────────────────────────────────────────────────

class TestUserUpsert:
    def test_user_created_inserts_row(self, db_session):
        _handle_user_upsert(db_session, _make_user_data())
        db_session.commit()

        user = db_session.query(User).filter(User.auth_subject == "user_test1").first()
        assert user is not None
        assert user.email == "alice@example.com"
        assert user.first_name == "Alice"
        assert user.email_verified is True

    def test_user_created_idempotent(self, db_session):
        data = _make_user_data()
        _handle_user_upsert(db_session, data)
        db_session.commit()
        _handle_user_upsert(db_session, data)
        db_session.commit()

        count = db_session.query(User).filter(User.auth_subject == "user_test1").count()
        assert count == 1

    def test_user_updated_with_role_sets_role(self, db_session):
        _handle_user_upsert(db_session, _make_user_data())
        db_session.commit()

        _handle_user_upsert(db_session, _make_user_data(role="owner"))
        db_session.commit()

        user = db_session.query(User).filter(User.auth_subject == "user_test1").first()
        assert user.role == UserAppRole.OWNER

    def test_user_email_match_links_existing_account(self, db_session):
        """Existing user without clerk_id gets auth_subject assigned on first upsert."""
        existing = User(email="alice@example.com", email_verified=False)
        db_session.add(existing)
        db_session.commit()

        _handle_user_upsert(db_session, _make_user_data())
        db_session.commit()

        linked = db_session.query(User).filter(User.email == "alice@example.com").first()
        assert linked.auth_subject == "user_test1"
        assert db_session.query(User).filter(User.email == "alice@example.com").count() == 1

    def test_user_with_platform_role_creates_platform_team_member(self, db_session):
        _handle_user_upsert(db_session, _make_user_data(platform_role="superadmin"))
        db_session.commit()

        user = db_session.query(User).filter(User.auth_subject == "user_test1").first()
        ptm = db_session.query(PlatformTeamMember).filter(
            PlatformTeamMember.user_id == user.id
        ).first()
        assert ptm is not None
        assert ptm.role == PlatformTeamRole.SUPERADMIN
        assert ptm.is_active is True

    def test_user_deleted_soft_deletes(self, db_session):
        _handle_user_upsert(db_session, _make_user_data())
        db_session.commit()

        _handle_user_deleted(db_session, {"id": "user_test1"})
        db_session.commit()

        user = db_session.query(User).filter(User.auth_subject == "user_test1").first()
        assert user.is_active is False

    def test_user_deleted_unknown_id_is_noop(self, db_session):
        """Deleting a non-existent user should not raise."""
        _handle_user_deleted(db_session, {"id": "user_ghost"})
        db_session.commit()  # no exception


class TestOrgUpsert:
    def test_org_created_inserts_row(self, db_session):
        user = User(email="owner@example.com", auth_subject="user_owner")
        db_session.add(user)
        db_session.commit()

        _handle_org_upsert(db_session, {"id": "org_abc", "name": "Acme Coworking", "created_by": "user_owner"})
        db_session.commit()

        org = db_session.query(Organization).filter(Organization.clerk_org_id == "org_abc").first()
        assert org is not None
        assert org.name == "Acme Coworking"
        assert org.owner_id == user.id

    def test_org_updated_changes_name(self, db_session):
        user = User(email="owner@example.com", auth_subject="user_owner")
        db_session.add(user)
        db_session.commit()

        _handle_org_upsert(db_session, {"id": "org_abc", "name": "Original", "created_by": "user_owner"})
        db_session.commit()
        _handle_org_upsert(db_session, {"id": "org_abc", "name": "New Name", "created_by": "user_owner"})
        db_session.commit()

        org = db_session.query(Organization).filter(Organization.clerk_org_id == "org_abc").first()
        assert org.name == "New Name"
        assert db_session.query(Organization).count() == 1

    def test_org_deleted_removes_row(self, db_session):
        user = User(email="owner@example.com", auth_subject="user_owner")
        db_session.add(user)
        db_session.commit()

        _handle_org_upsert(db_session, {"id": "org_del", "name": "To Delete", "created_by": "user_owner"})
        db_session.commit()

        _handle_org_deleted(db_session, {"id": "org_del"})
        db_session.commit()

        assert db_session.query(Organization).filter(Organization.clerk_org_id == "org_del").first() is None

    def test_org_deleted_unknown_id_is_noop(self, db_session):
        _handle_org_deleted(db_session, {"id": "org_ghost"})
        db_session.commit()  # no exception


class TestMembershipUpsert:
    def _setup(self, db_session):
        user = User(email="member@example.com", auth_subject="user_member")
        db_session.add(user)
        db_session.commit()
        org = Organization(
            clerk_org_id="org_xyz",
            name="Test Org",
            owner_id=user.id,
            review_status=OrganizationReviewStatus.APPROVED,
            onboarding_completed=True,
        )
        db_session.add(org)
        db_session.commit()
        return user, org

    def _membership_data(self, membership_id: str = "mem_1", role: str = "org:member") -> dict:
        return {
            "id": membership_id,
            "role": role,
            "organization": {"id": "org_xyz"},
            "public_user_data": {"user_id": "user_member"},
        }

    def test_membership_created(self, db_session):
        user, org = self._setup(db_session)

        _handle_membership_upsert(db_session, self._membership_data())
        db_session.commit()

        mem = db_session.query(OrganizationMember).filter(
            OrganizationMember.clerk_membership_id == "mem_1"
        ).first()
        assert mem is not None
        assert mem.user_id == user.id
        assert mem.organization_id == org.id

    def test_membership_idempotent(self, db_session):
        self._setup(db_session)
        data = self._membership_data()

        _handle_membership_upsert(db_session, data)
        db_session.commit()
        _handle_membership_upsert(db_session, data)
        db_session.commit()

        count = db_session.query(OrganizationMember).filter(
            OrganizationMember.clerk_membership_id == "mem_1"
        ).count()
        assert count == 1

    def test_membership_deleted_removes_row(self, db_session):
        self._setup(db_session)
        _handle_membership_upsert(db_session, self._membership_data())
        db_session.commit()

        _handle_membership_deleted(db_session, {"id": "mem_1"})
        db_session.commit()

        assert db_session.query(OrganizationMember).filter(
            OrganizationMember.clerk_membership_id == "mem_1"
        ).first() is None

    def test_membership_deleted_unknown_id_is_noop(self, db_session):
        _handle_membership_deleted(db_session, {"id": "mem_ghost"})
        db_session.commit()  # no exception

    def test_membership_skipped_when_org_unknown(self, db_session):
        user = User(email="x@example.com", auth_subject="user_x")
        db_session.add(user)
        db_session.commit()

        data = {
            "id": "mem_bad",
            "role": "org:member",
            "organization": {"id": "org_nonexistent"},
            "public_user_data": {"user_id": "user_x"},
        }
        _handle_membership_upsert(db_session, data)  # should not raise
        db_session.commit()

        assert db_session.query(OrganizationMember).filter(
            OrganizationMember.clerk_membership_id == "mem_bad"
        ).first() is None


# ──────────────────────────────────────────────────────────────────────────────
# Webhook HTTP endpoint tests (signature verification)
# ──────────────────────────────────────────────────────────────────────────────

class TestWebhookEndpoint:
    def test_invalid_signature_returns_401(self, client_factory):
        client = client_factory({})
        with patch("app.core.config.settings.CLERK_WEBHOOK_SECRET", "whsec_real"):
            resp = client.post(
                "/webhooks/clerk",
                content=json.dumps({"type": "user.created", "data": _make_user_data()}).encode(),
                headers={
                    "svix-id": "msg_bad",
                    "svix-timestamp": str(int(time.time())),
                    "svix-signature": "v1,badsignature==",
                    "Content-Type": "application/json",
                },
            )
        assert resp.status_code == 401

    def test_valid_user_created_inserts_row(self, client_factory, db_session):
        client = client_factory({})
        data = _make_user_data(clerk_id="user_http1", email="http@example.com")
        event = {"type": "user.created", "data": data}

        with patch("app.api.webhooks_clerk._verify_svix", return_value=event):
            resp = client.post(
                "/webhooks/clerk",
                json=event,
                headers={
                    "svix-id": "msg_ok",
                    "svix-timestamp": str(int(time.time())),
                    "svix-signature": "v1,fake",
                },
            )

        assert resp.status_code == 200
        assert db_session.query(User).filter(User.auth_subject == "user_http1").first() is not None

    def test_duplicate_event_returns_200_no_duplicate_row(self, client_factory, db_session):
        client = client_factory({})
        data = _make_user_data(clerk_id="user_dup", email="dup@example.com")
        event = {"type": "user.created", "data": data}

        with patch("app.api.webhooks_clerk._verify_svix", return_value=event):
            for _ in range(2):
                resp = client.post("/webhooks/clerk", json=event, headers={
                    "svix-id": "msg_dup",
                    "svix-timestamp": str(int(time.time())),
                    "svix-signature": "v1,fake",
                })
                assert resp.status_code == 200

        assert db_session.query(User).filter(User.auth_subject == "user_dup").count() == 1

    def test_org_created_event_inserts_org(self, client_factory, db_session):
        user = User(email="webhookowner@example.com", auth_subject="user_wh_owner")
        db_session.add(user)
        db_session.commit()

        event = {
            "type": "organization.created",
            "data": {"id": "org_wh", "name": "Webhook Org", "created_by": "user_wh_owner"},
        }
        with patch("app.api.webhooks_clerk._verify_svix", return_value=event):
            resp = client_factory({}).post("/webhooks/clerk", json=event, headers={
                "svix-id": "msg_org",
                "svix-timestamp": str(int(time.time())),
                "svix-signature": "v1,fake",
            })

        assert resp.status_code == 200
        assert db_session.query(Organization).filter(Organization.clerk_org_id == "org_wh").first() is not None

    def test_unknown_event_type_returns_200_ignored(self, client_factory):
        event = {"type": "session.created", "data": {}}
        with patch("app.api.webhooks_clerk._verify_svix", return_value=event):
            resp = client_factory({}).post("/webhooks/clerk", json=event, headers={
                "svix-id": "msg_unk",
                "svix-timestamp": str(int(time.time())),
                "svix-signature": "v1,fake",
            })
        assert resp.status_code == 200
        assert resp.json()["action"] == "ignored"


# ──────────────────────────────────────────────────────────────────────────────
# Onboarding API tests
# ──────────────────────────────────────────────────────────────────────────────

class TestOnboardingProfile:
    def test_no_token_returns_401(self, anon_client):
        """No Authorization header → 401 Missing auth."""
        resp = anon_client.post(
            "/api/onboarding/profile",
            json={"role": "customer", "terms_accepted": True},
        )
        assert resp.status_code == 401

    def test_valid_profile_sets_role_and_name(self, client_factory, db_session):
        user = User(email="prof@example.com", auth_subject="user_prof")
        db_session.add(user)
        db_session.commit()

        with patch("app.api.onboarding._update_clerk_metadata"):
            resp = client_factory({"sub": "user_prof"}).post(
                "/api/onboarding/profile",
                json={
                    "role": "customer",
                    "full_name": "Jane Doe",
                    "terms_accepted": True,
                    "privacy_policy_accepted": True,
                },
            )

        assert resp.status_code == 200
        db_session.refresh(user)
        assert user.role == UserAppRole.CUSTOMER
        assert user.first_name == "Jane"
        assert user.last_name == "Doe"
        assert user.terms_accepted_at is not None

    def test_owner_role_returned_in_response(self, client_factory, db_session):
        user = User(email="owner@example.com", auth_subject="user_ownr")
        db_session.add(user)
        db_session.commit()

        with patch("app.api.onboarding._update_clerk_metadata"):
            resp = client_factory({"sub": "user_ownr"}).post(
                "/api/onboarding/profile",
                json={"role": "owner", "full_name": "Bob Builder", "terms_accepted": True},
            )

        assert resp.status_code == 200
        assert resp.json()["role"] == "owner"

    def test_blank_full_name_returns_422(self, client_factory, db_session):
        user = User(email="blank@example.com", auth_subject="user_blank")
        db_session.add(user)
        db_session.commit()

        with patch("app.api.onboarding._update_clerk_metadata"):
            resp = client_factory({"sub": "user_blank"}).post(
                "/api/onboarding/profile",
                json={"role": "customer", "full_name": "   "},
            )

        assert resp.status_code == 422

    def test_invalid_role_returns_422(self, client_factory, db_session):
        user = User(email="badrole@example.com", auth_subject="user_badrole")
        db_session.add(user)
        db_session.commit()

        with patch("app.api.onboarding._update_clerk_metadata"):
            resp = client_factory({"sub": "user_badrole"}).post(
                "/api/onboarding/profile",
                json={"role": "supervillain"},
            )

        assert resp.status_code == 422


class TestOnboardingOrganization:
    def _owner(self, db_session, suffix: str = ""):
        user = User(
            email=f"orgowner{suffix}@example.com",
            auth_subject=f"user_orgown{suffix}",
            role=UserAppRole.OWNER,
        )
        db_session.add(user)
        db_session.commit()
        return user, {"sub": f"user_orgown{suffix}"}

    def test_no_token_returns_401(self, anon_client):
        resp = anon_client.post("/api/onboarding/organization", json={"name": "Org"})
        assert resp.status_code == 401

    def test_non_owner_returns_403(self, client_factory, db_session):
        user = User(email="cust@example.com", auth_subject="user_cust", role=UserAppRole.CUSTOMER)
        db_session.add(user)
        db_session.commit()

        resp = client_factory({"sub": "user_cust"}).post(
            "/api/onboarding/organization", json={"name": "Test Org"}
        )
        assert resp.status_code == 403

    def test_blank_name_returns_422(self, client_factory, db_session):
        _, token = self._owner(db_session, "blank")
        resp = client_factory(token).post("/api/onboarding/organization", json={"name": ""})
        assert resp.status_code == 422

    def test_invalid_size_returns_422(self, client_factory, db_session):
        _, token = self._owner(db_session, "sz")
        resp = client_factory(token).post(
            "/api/onboarding/organization",
            json={"name": "Org", "size": "5000"},
        )
        assert resp.status_code == 422

    def test_valid_org_created_with_onboarding_complete(self, client_factory, db_session):
        user, token = self._owner(db_session)

        with patch("app.services.amenities.seed_default_amenities"):
            resp = client_factory(token).post(
                "/api/onboarding/organization",
                json={"name": "Acme Spaces", "industry": "Coworking", "size": "1-10"},
            )

        assert resp.status_code == 200
        org = db_session.query(Organization).filter(Organization.owner_id == user.id).first()
        assert org is not None
        assert org.name == "Acme Spaces"
        assert org.onboarding_completed is True
        assert org.industry == "Coworking"

    def test_duplicate_call_updates_not_creates(self, client_factory, db_session):
        user, token = self._owner(db_session, "dup")

        with patch("app.services.amenities.seed_default_amenities"):
            client_factory(token).post("/api/onboarding/organization", json={"name": "First"})
            resp = client_factory(token).post("/api/onboarding/organization", json={"name": "Updated"})

        assert resp.status_code == 200
        assert db_session.query(Organization).filter(Organization.owner_id == user.id).count() == 1
        assert db_session.query(Organization).filter(Organization.owner_id == user.id).first().name == "Updated"

    def test_response_has_organization_true_after_creation(self, client_factory, db_session):
        user, token = self._owner(db_session, "hasorg")

        with patch("app.services.amenities.seed_default_amenities"):
            resp = client_factory(token).post(
                "/api/onboarding/organization", json={"name": "My Space"}
            )

        assert resp.status_code == 200
        assert resp.json()["has_organization"] is True
