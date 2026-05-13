"""API auth: verify Clerk JWTs and internal impersonation JWTs."""
import time
from functools import lru_cache
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

bearer_scheme = HTTPBearer(auto_error=False)

# After a JWKS fetch failure, block retries for this many seconds.
# Prevents a thundering herd of outbound HTTP calls during a Clerk outage.
_JWKS_BACKOFF_SECONDS = 30.0
_jwks_retry_after: float = 0.0


@lru_cache(maxsize=1)
def _fetch_clerk_jwks() -> dict[str, Any]:
    """Fetch Clerk JWKS from the network. Result is cached indefinitely until
    manually cleared (key rotation) or the process restarts."""
    if not settings.CLERK_JWKS_URL:
        raise RuntimeError("CLERK_JWKS_URL not configured")
    resp = httpx.get(settings.CLERK_JWKS_URL, timeout=5.0)
    resp.raise_for_status()
    return resp.json()


def _get_clerk_jwks() -> dict[str, Any]:
    """Return the cached JWKS, applying a backoff on repeated failures."""
    global _jwks_retry_after
    if time.monotonic() < _jwks_retry_after:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable")
    try:
        return _fetch_clerk_jwks()
    except HTTPException:
        raise
    except Exception as exc:
        _jwks_retry_after = time.monotonic() + _JWKS_BACKOFF_SECONDS
        _fetch_clerk_jwks.cache_clear()
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable") from exc


def _verify_internal_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.JWT_AUDIENCE,
            issuer=settings.JWT_ISSUER,
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token verification failed") from exc


def _verify_clerk_token(token: str, unverified_header: dict[str, Any]) -> dict[str, Any]:
    jwks = _get_clerk_jwks()
    kid = unverified_header.get("kid")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        # JWKS may have rotated — bust the cache and retry once
        _fetch_clerk_jwks.cache_clear()
        jwks = _get_clerk_jwks()
        key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if not key:
        raise HTTPException(status_code=401, detail="Signing key not found")

    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk JWTs have no audience by default
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token expired") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Token verification failed") from exc


def verify_token(token: str) -> dict[str, Any]:
    """Verify a Clerk RS256 JWT or an internal HS256 impersonation token."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token header") from exc

    alg = unverified_header.get("alg")
    if alg == "HS256":
        return _verify_internal_token(token)
    if alg == "RS256":
        return _verify_clerk_token(token, unverified_header)
    raise HTTPException(status_code=401, detail="Unsupported token algorithm")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict[str, Any]:
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
