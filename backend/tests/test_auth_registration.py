from sqlalchemy import func

from app.models.enums import UserAppRole
from app.models.user import User


def test_member_registration_normalizes_email_and_blocks_case_duplicate(db_session, client_factory):
    client = client_factory({})

    first = client.post(
        "/auth/register",
        json={
            "email": "  Case@Test.com  ",
            "password": "secret123",
            "first_name": "Case",
            "last_name": "Member",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/register",
        json={
            "email": "case@test.com",
            "password": "secret456",
            "first_name": "Case",
            "last_name": "Duplicate",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )
    assert second.status_code == 400

    user = db_session.query(User).filter(func.lower(User.email) == "case@test.com").one()
    assert user.email == "case@test.com"
    assert user.role == UserAppRole.MEMBER


def test_owner_registration_is_supported_for_hidden_owner_signup(db_session, client_factory):
    client = client_factory({})

    response = client.post(
        "/auth/register",
        json={
            "email": "owner-signup@example.com",
            "password": "secret123",
            "first_name": "Owner",
            "last_name": "User",
            "role": "owner",
            "terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )

    assert response.status_code == 200
    user = db_session.query(User).filter(User.email == "owner-signup@example.com").one()
    assert user.role == UserAppRole.OWNER
