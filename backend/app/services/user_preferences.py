from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user_preferences import UserPreference

DEFAULT_THEME_FAMILY = "neutral"
DEFAULT_THEME_MODE = "system"


def ensure_user_preferences(db: Session, user_id: int) -> UserPreference:
    """Return the user's preferences row, creating defaults on first access.

    Tolerates a concurrent insert by retrying the lookup after an
    IntegrityError (same approach as ensure_notification_preferences).
    """
    prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
    if prefs:
        return prefs
    prefs = UserPreference(
        user_id=user_id,
        theme_family=DEFAULT_THEME_FAMILY,
        theme_mode=DEFAULT_THEME_MODE,
    )
    db.add(prefs)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        prefs = db.query(UserPreference).filter(UserPreference.user_id == user_id).first()
        if prefs:
            return prefs
        raise
    db.refresh(prefs)
    return prefs
