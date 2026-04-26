"""API auth: verify our own JWT (issued after login or OAuth callback)."""
from typing import Any

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def verify_token(token: str) -> dict[str, Any]:
    """Verify our JWT and return payload (sub, email, role)."""
    if not settings.JWT_SECRET:
        raise HTTPException(status_code=401, detail="Auth not configured")
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token verification failed") from exc
    return payload


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing auth")
    return verify_token(credentials.credentials)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any] | None:
    if not credentials:
        return None
    return verify_token(credentials.credentials)


def require_email_verified(user: dict[str, Any]) -> None:
    if not user.get("email_verified", False):
        raise HTTPException(status_code=403, detail="Email verification required")
