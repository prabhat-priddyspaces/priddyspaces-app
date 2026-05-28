import base64
import hashlib
import secrets
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlencode, quote

import jwt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.jwt import issue_token
from app.core.password import hash_password, verify_password
from app.db.deps import get_db
from app.models.user import User
from app.schemas.auth import LoginIn, RegisterIn, TokenOut
from app.services.email_identity import get_user_by_normalized_email, normalize_email
from app.services.auth_user import get_or_create_user
from app.services.loyalty import grant_priddy_signup_points
from app.services.platform_auth import issue_standard_token, touch_platform_last_login

router = APIRouter(prefix="/auth", tags=["auth"])


@lru_cache(maxsize=1)
def _get_oauth_jwks() -> dict[str, Any]:
    if not settings.AUTH_JWKS_URL:
        return {"keys": []}
    resp = httpx.get(settings.AUTH_JWKS_URL, timeout=5.0)
    resp.raise_for_status()
    return resp.json()


def _verify_oauth_id_token(token: str) -> dict[str, Any]:
    """Verify Google/Apple id_token and return payload (sub, email, name, email_verified)."""
    if not settings.AUTH_JWKS_URL:
        raise HTTPException(status_code=500, detail="OAuth JWKS not configured")
    jwks = _get_oauth_jwks()
    try:
        unverified = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail="Invalid token") from exc
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == unverified.get("kid")), None)
    if not key:
        raise HTTPException(status_code=400, detail="Signing key not found")
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[unverified.get("alg", "RS256")],
            audience=settings.AUTH_AUDIENCE or None,
            issuer=settings.AUTH_ISSUER or None,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail="Token verification failed") from exc
    return payload


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _pkce_challenge(verifier: str) -> str:
    return _base64url_encode(hashlib.sha256(verifier.encode("ascii")).digest())


def _secure_cookie() -> bool:
    return settings.BACKEND_URL.startswith("https://")


@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)) -> TokenOut:
    if not payload.terms_accepted or not payload.privacy_policy_accepted:
        raise HTTPException(status_code=400, detail="Terms and privacy policy must be accepted")
    email = normalize_email(payload.email)
    existing = get_user_by_normalized_email(db, email)
    if existing and existing.password_hash:
        raise HTTPException(status_code=400, detail="Email already registered")
    now = datetime.now(timezone.utc)
    if existing:
        user = existing
        user.password_hash = hash_password(payload.password)
        user.first_name = payload.first_name
        user.last_name = payload.last_name
        user.full_name = f"{payload.first_name} {payload.last_name}".strip()
        user.role = user.role or payload.role
        user.terms_accepted_at = now
        user.privacy_policy_accepted_at = now
        user.email_verified = True
        db.add(user)
    else:
        user = User(
            email=email,
            password_hash=hash_password(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            full_name=f"{payload.first_name} {payload.last_name}".strip(),
            role=payload.role,
            terms_accepted_at=now,
            privacy_policy_accepted_at=now,
            email_verified=True,
        )
        db.add(user)
    db.flush()
    grant_priddy_signup_points(db, user)
    db.commit()
    db.refresh(user)
    token = issue_token(
        str(user.public_id),
        user.email,
        user.role.value if user.role else None,
        email_verified=user.email_verified,
    )
    return TokenOut(access_token=token)


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = get_user_by_normalized_email(db, payload.email)
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account disabled")
    if not user.email_verified:
        user.email_verified = True
        db.add(user)
        db.commit()
        db.refresh(user)
    touch_platform_last_login(db, user.id)
    token = issue_standard_token(user)
    return TokenOut(access_token=token)


def _apple_client_secret() -> str:
    if not (
        settings.OAUTH_APPLE_TEAM_ID
        and settings.OAUTH_APPLE_KEY_ID
        and settings.OAUTH_APPLE_CLIENT_ID
        and settings.OAUTH_APPLE_PRIVATE_KEY
    ):
        raise HTTPException(status_code=500, detail="Apple OAuth not configured")
    now = int(time.time())
    payload = {
        "iss": settings.OAUTH_APPLE_TEAM_ID,
        "iat": now,
        "exp": now + 600,
        "aud": "https://appleid.apple.com",
        "sub": settings.OAUTH_APPLE_CLIENT_ID
    }
    return jwt.encode(
        payload,
        settings.OAUTH_APPLE_PRIVATE_KEY,
        algorithm="ES256",
        headers={"kid": settings.OAUTH_APPLE_KEY_ID}
    )


@router.get("/login/google")
def login_google() -> RedirectResponse:
    if not settings.OAUTH_GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")

    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = _pkce_challenge(verifier)

    redirect_uri = f"{settings.BACKEND_URL}/auth/callback/google"
    params = {
        "client_id": settings.OAUTH_GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "access_type": "offline",
        "prompt": "consent"
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    response = RedirectResponse(url)
    response.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        max_age=settings.OAUTH_STATE_TTL_SECONDS
    )
    response.set_cookie(
        "oauth_verifier",
        verifier,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        max_age=settings.OAUTH_STATE_TTL_SECONDS
    )
    return response


@router.get("/login/apple")
def login_apple() -> RedirectResponse:
    if not settings.OAUTH_APPLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Apple OAuth not configured")

    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = _pkce_challenge(verifier)

    redirect_uri = f"{settings.BACKEND_URL}/auth/callback/apple"
    params = {
        "client_id": settings.OAUTH_APPLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "response_mode": "query",
        "scope": "name email",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state
    }
    url = f"https://appleid.apple.com/auth/authorize?{urlencode(params)}"

    response = RedirectResponse(url)
    response.set_cookie(
        "oauth_state",
        state,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        max_age=settings.OAUTH_STATE_TTL_SECONDS
    )
    response.set_cookie(
        "oauth_verifier",
        verifier,
        httponly=True,
        secure=_secure_cookie(),
        samesite="lax",
        max_age=settings.OAUTH_STATE_TTL_SECONDS
    )
    return response


@router.get("/callback/google")
async def callback_google(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    if not settings.OAUTH_GOOGLE_CLIENT_ID or not settings.OAUTH_GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code/state")

    cookie_state = request.cookies.get("oauth_state")
    verifier = request.cookies.get("oauth_verifier")
    if not cookie_state or state != cookie_state or not verifier:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    token_url = "https://oauth2.googleapis.com/token"
    redirect_uri = f"{settings.BACKEND_URL}/auth/callback/google"
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.OAUTH_GOOGLE_CLIENT_ID,
        "client_secret": settings.OAUTH_GOOGLE_CLIENT_SECRET,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(token_url, data=data)
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    token_payload = resp.json()
    id_token = token_payload.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="Missing id_token from provider")

    claims = _verify_oauth_id_token(id_token)
    user = get_or_create_user(db, claims)
    touch_platform_last_login(db, user.id)
    our_token = issue_standard_token(user)
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={quote(our_token)}"
    response = RedirectResponse(redirect_url)
    response.delete_cookie("oauth_state")
    response.delete_cookie("oauth_verifier")
    return response


@router.get("/callback/apple")
async def callback_apple(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code/state")

    cookie_state = request.cookies.get("oauth_state")
    verifier = request.cookies.get("oauth_verifier")
    if not cookie_state or state != cookie_state or not verifier:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    client_secret = _apple_client_secret()
    token_url = "https://appleid.apple.com/auth/token"
    redirect_uri = f"{settings.BACKEND_URL}/auth/callback/apple"
    data = {
        "grant_type": "authorization_code",
        "client_id": settings.OAUTH_APPLE_CLIENT_ID,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(token_url, data=data)
    if resp.status_code >= 400:
        raise HTTPException(status_code=400, detail="OAuth token exchange failed")

    token_payload = resp.json()
    id_token = token_payload.get("id_token")
    if not id_token:
        raise HTTPException(status_code=400, detail="Missing id_token from provider")

    claims = _verify_oauth_id_token(id_token)
    user = get_or_create_user(db, claims)
    touch_platform_last_login(db, user.id)
    our_token = issue_standard_token(user)
    redirect_url = f"{settings.FRONTEND_URL}/auth/callback?token={quote(our_token)}"
    response = RedirectResponse(redirect_url)
    response.delete_cookie("oauth_state")
    response.delete_cookie("oauth_verifier")
    return response
