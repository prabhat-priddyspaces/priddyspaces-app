from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_normalized_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(func.lower(User.email) == normalize_email(email)).first()
