"""Issue and verify our own JWT for API auth (email/password and OAuth both get this token)."""
import time
from typing import Any

import jwt

from app.core.config import settings


def issue_token(
    sub: str,
    email: str,
    role: str | None,
    *,
    email_verified: bool,
    actor_sub: str | None = None,
    actor_email: str | None = None,
    actor_platform_role: str | None = None,
    impersonation_reason: str | None = None,
) -> str:
    """Issue a JWT for the given user. sub = user public_id."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "email": email,
        "email_verified": email_verified,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "exp": now + settings.JWT_EXPIRE_SECONDS,
    }
    if role is not None:
        payload["role"] = role
    if actor_sub is not None:
        payload["actor_sub"] = actor_sub
    if actor_email is not None:
        payload["actor_email"] = actor_email
    if actor_platform_role is not None:
        payload["actor_platform_role"] = actor_platform_role
    if impersonation_reason is not None:
        payload["impersonation_reason"] = impersonation_reason
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm="HS256",
    )
