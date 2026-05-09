from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.enums import UserAppRole
from app.models.user import User


def get_or_create_user(db: Session, payload: dict) -> User:
    """Resolve the User row for the authenticated request.

    Clerk RS256 JWTs carry only `sub` (Clerk user id) — no `email` claim. The
    `users.auth_subject` row is created/updated out-of-band by the
    `/webhooks/clerk` user.created/user.updated handlers, so the common path
    here is just a lookup by sub.

    Legacy HS256 tokens issued by `app.core.jwt.issue_token` have both `sub`
    (user public_id) and `email`, and the impersonation-stop endpoint still
    issues them — the email-keyed branch keeps that path working.
    """
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Missing token subject")

    user = db.query(User).filter(User.auth_subject == sub).first()
    if user:
        return user

    # Legacy HS256 token: sub is our public_id.
    user = db.query(User).filter(User.public_id == sub).first()
    if user:
        return user

    email = payload.get("email")
    if email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            if not user.auth_subject:
                user.auth_subject = sub
            if payload.get("name") and not user.full_name:
                user.full_name = payload.get("name")
            user.email_verified = user.email_verified or payload.get("email_verified", False)
            if user.role is None:
                user.role = UserAppRole.CUSTOMER
            db.add(user)
            db.commit()
            db.refresh(user)
            return user

        # Last-resort create — only reachable when email is in the payload
        # (legacy flow). Clerk users get their row from the webhook handler.
        user = User(
            auth_subject=sub,
            email=email,
            full_name=payload.get("name"),
            email_verified=payload.get("email_verified", False),
            role=UserAppRole.CUSTOMER,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    # Clerk-issued token whose sub we've never seen — webhook hasn't run, or
    # the user was deleted on Clerk's side. 401 lets the dashboard show the
    # "Couldn't load your account" UI instead of crashing.
    raise HTTPException(
        status_code=401,
        detail="User not provisioned; replay the user.created webhook.",
    )
