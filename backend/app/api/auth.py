from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.jwt import issue_token
from app.core.password import hash_password, verify_password
from app.db.deps import get_db
from app.models.user import User
from app.schemas.auth import LoginIn, RegisterIn, TokenOut
from app.services.email_identity import get_user_by_normalized_email, normalize_email
from app.services.auth_user import get_or_create_user
from app.services.loyalty import grant_priddy_signup_points
from app.services.platform_auth import issue_standard_token, touch_platform_last_login
from app.services.access_passes import claim_guest_bookings_for_user

router = APIRouter(prefix="/auth", tags=["auth"])


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
    claim_guest_bookings_for_user(db, user)
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
    claim_guest_bookings_for_user(db, user)
    db.commit()
    touch_platform_last_login(db, user.id)
    token = issue_standard_token(user)
    return TokenOut(access_token=token)
