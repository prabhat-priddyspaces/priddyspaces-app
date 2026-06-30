"""API + RBAC tests for the space-type registry endpoints."""
from fastapi.testclient import TestClient

from app.core.jwt import issue_token
from app.db.deps import get_db
from app.main import app
from app.models.enums import PlatformTeamRole, UserAppRole
from app.models.platform_team_member import PlatformTeamMember
from app.models.user import User


def _user(db_session, email: str) -> User:
    user = User(
        email=email,
        auth_subject=f"sub-{email}",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _platform_user(db_session, email: str, role: PlatformTeamRole) -> User:
    user = _user(db_session, email)
    db_session.add(PlatformTeamMember(user_id=user.id, role=role, is_active=True))
    db_session.commit()
    return user


def _token(user: User) -> str:
    return issue_token(
        str(user.public_id),
        user.email,
        user.role.value if user.role else None,
        email_verified=True,
    )


def _client(db_session) -> TestClient:
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {_token(user)}"}


def test_public_lists_enabled_sorted_with_modes(db_session):
    try:
        client = _client(db_session)
        res = client.get("/api/space-types")
        assert res.status_code == 200
        rows = res.json()
        keys = [r["key"] for r in rows]
        # Built-ins are present and sorted by sort_order.
        assert keys[:3] == ["private_office", "shared_desk", "conference_room"]
        assert "event_space" in keys and "business_address" in keys

        by_key = {r["key"]: r for r in rows}
        assert set(by_key["event_space"]["valid_booking_modes"]) == {"hourly", "day_pass"}
        assert by_key["event_space"]["default_booking_mode"] == "hourly"
        assert by_key["business_address"]["valid_booking_modes"] == ["virtual_membership"]
        assert by_key["business_address"]["has_physical_inventory"] is False
    finally:
        app.dependency_overrides.clear()


def test_create_requires_platform_write_role(db_session):
    try:
        client = _client(db_session)
        plain = _user(db_session, "plain@example.com")
        support = _platform_user(db_session, "support@example.com", PlatformTeamRole.SUPPORT)
        body = {"key": "pod_room", "label": "Pod Room", "archetype": "room_hourly"}

        assert client.post("/api/admin/space-types", json=body, headers=_auth(plain)).status_code == 403
        assert client.post("/api/admin/space-types", json=body, headers=_auth(support)).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_admin_create_appears_in_public_list(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin@example.com", PlatformTeamRole.ADMIN)
        body = {
            "key": "day_office",
            "label": "Day Office",
            "archetype": "room_hourly",
            "marketplace_category": "meeting_room",
        }
        created = client.post("/api/admin/space-types", json=body, headers=_auth(admin))
        assert created.status_code == 201
        assert created.json()["is_system"] is False

        public = client.get("/api/space-types").json()
        assert any(r["key"] == "day_office" for r in public)
    finally:
        app.dependency_overrides.clear()


def test_create_rejects_unknown_archetype(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin2@example.com", PlatformTeamRole.ADMIN)
        body = {"key": "weird", "label": "Weird", "archetype": "teleporter"}
        res = client.post("/api/admin/space-types", json=body, headers=_auth(admin))
        assert res.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_disable_hides_from_public(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin3@example.com", PlatformTeamRole.ADMIN)
        rows = client.get("/api/admin/space-types", headers=_auth(admin)).json()
        conf = next(r for r in rows if r["key"] == "conference_room")

        patched = client.patch(
            f"/api/admin/space-types/{conf['public_id']}",
            json={"is_enabled": False},
            headers=_auth(admin),
        )
        assert patched.status_code == 200

        public_keys = [r["key"] for r in client.get("/api/space-types").json()]
        assert "conference_room" not in public_keys
        # Still present in the admin (all) list.
        admin_keys = [r["key"] for r in client.get("/api/admin/space-types", headers=_auth(admin)).json()]
        assert "conference_room" in admin_keys
    finally:
        app.dependency_overrides.clear()


def test_archetype_change_blocked_for_builtin(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin4@example.com", PlatformTeamRole.ADMIN)
        rows = client.get("/api/admin/space-types", headers=_auth(admin)).json()
        suite = next(r for r in rows if r["key"] == "suite")
        res = client.patch(
            f"/api/admin/space-types/{suite['public_id']}",
            json={"archetype": "room_hourly"},
            headers=_auth(admin),
        )
        assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_reorder_updates_sort_order(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin5@example.com", PlatformTeamRole.ADMIN)
        rows = client.get("/api/admin/space-types", headers=_auth(admin)).json()
        first = rows[0]
        res = client.post(
            "/api/admin/space-types/reorder",
            json={"items": [{"public_id": first["public_id"], "sort_order": 999}]},
            headers=_auth(admin),
        )
        assert res.status_code == 200
        updated = next(r for r in res.json() if r["public_id"] == first["public_id"])
        assert updated["sort_order"] == 999
    finally:
        app.dependency_overrides.clear()


def test_create_rejects_duplicate_key(db_session):
    try:
        client = _client(db_session)
        admin = _platform_user(db_session, "admin6@example.com", PlatformTeamRole.ADMIN)
        body = {"key": "conference_room", "label": "Dup", "archetype": "room_hourly"}
        res = client.post("/api/admin/space-types", json=body, headers=_auth(admin))
        assert res.status_code == 409
    finally:
        app.dependency_overrides.clear()
