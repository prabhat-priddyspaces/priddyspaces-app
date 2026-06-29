from app.models.enums import UserAppRole
from app.models.user import User
from app.models.user_preferences import UserPreference


def _auth(user: User) -> dict:
    return {"sub": user.auth_subject, "email": user.email, "email_verified": True}


def _user(db, email: str, role: UserAppRole = UserAppRole.MEMBER) -> User:
    user = User(
        email=email,
        auth_subject=f"sub-{email}",
        role=role,
        email_verified=True,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_get_preferences_creates_defaults(client_factory, db_session):
    user = _user(db_session, "prefs-default@example.com")
    client = client_factory(_auth(user))

    resp = client.get("/api/preferences")

    assert resp.status_code == 200
    assert resp.json() == {"theme_family": "neutral", "theme_mode": "system"}

    row = (
        db_session.query(UserPreference)
        .filter(UserPreference.user_id == user.id)
        .first()
    )
    assert row is not None
    assert row.theme_family == "neutral"
    assert row.theme_mode == "system"


def test_patch_updates_and_persists(client_factory, db_session):
    user = _user(db_session, "prefs-update@example.com")
    client = client_factory(_auth(user))

    resp = client.patch(
        "/api/preferences",
        json={"theme_family": "premium", "theme_mode": "dark"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"theme_family": "premium", "theme_mode": "dark"}

    # A follow-up GET returns the saved values (persisted to the account).
    resp2 = client.get("/api/preferences")
    assert resp2.json() == {"theme_family": "premium", "theme_mode": "dark"}


def test_patch_partial_leaves_other_field(client_factory, db_session):
    user = _user(db_session, "prefs-partial@example.com")
    client = client_factory(_auth(user))

    client.patch("/api/preferences", json={"theme_family": "warm"})

    resp = client.get("/api/preferences")
    assert resp.json() == {"theme_family": "warm", "theme_mode": "system"}


def test_patch_rejects_invalid_family(client_factory, db_session):
    user = _user(db_session, "prefs-invalid-family@example.com")
    client = client_factory(_auth(user))

    resp = client.patch("/api/preferences", json={"theme_family": "rainbow"})
    assert resp.status_code == 422


def test_patch_rejects_invalid_mode(client_factory, db_session):
    user = _user(db_session, "prefs-invalid-mode@example.com")
    client = client_factory(_auth(user))

    resp = client.patch("/api/preferences", json={"theme_mode": "sepia"})
    assert resp.status_code == 422
