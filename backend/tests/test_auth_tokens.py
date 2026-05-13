import time

import jwt
import pytest
from fastapi import HTTPException

from app.core.auth import verify_token
from app.core.config import settings
from app.core.jwt import issue_token


def test_verify_token_accepts_internal_hs256_token():
    token = issue_token(
        "user_public_id",
        "owner@example.com",
        "owner",
        email_verified=True,
        actor_sub="admin_public_id",
        actor_email="admin@example.com",
        actor_platform_role="superadmin",
        impersonation_reason="Owner support review",
    )

    payload = verify_token(token)

    assert payload["sub"] == "user_public_id"
    assert payload["email"] == "owner@example.com"
    assert payload["actor_sub"] == "admin_public_id"
    assert payload["impersonation_reason"] == "Owner support review"


def test_verify_token_rejects_expired_internal_token():
    token = jwt.encode(
        {
            "sub": "user_public_id",
            "email": "owner@example.com",
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "iat": int(time.time()) - 120,
            "exp": int(time.time()) - 60,
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )

    with pytest.raises(HTTPException) as exc:
        verify_token(token)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Token expired"


def test_verify_token_rejects_unsupported_algorithm():
    token = jwt.encode(
        {
            "sub": "user_public_id",
            "email": "owner@example.com",
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
            "iat": int(time.time()),
            "exp": int(time.time()) + 60,
        },
        settings.JWT_SECRET,
        algorithm="HS512",
    )

    with pytest.raises(HTTPException) as exc:
        verify_token(token)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Unsupported token algorithm"
