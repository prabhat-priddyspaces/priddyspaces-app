from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.enums import UserAppRole
from app.models.user import User


def get_or_create_user(db: Session, payload: dict) -> User:
    email = payload.get("email")
    sub = payload.get("sub")
    if not email or not sub:
        raise ValueError("Missing required claims")

    user = db.query(User).filter(User.auth_subject == sub).first()
    if user:
        return user
    user = db.query(User).filter(User.public_id == sub).first()
    if user:
        return user

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

    name = payload.get("name")
    user = User(
        auth_subject=sub,
        email=email,
        full_name=name,
        email_verified=payload.get("email_verified", False),
        role=UserAppRole.CUSTOMER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
