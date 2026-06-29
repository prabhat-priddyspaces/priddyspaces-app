from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.deps import get_db
from app.schemas.user_preferences import UserPreferenceOut, UserPreferenceUpdate
from app.services.auth_user import get_or_create_user
from app.services.user_preferences import ensure_user_preferences

router = APIRouter()


@router.get("/preferences", response_model=UserPreferenceOut)
def get_preferences(
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    return ensure_user_preferences(db, user.id)


@router.patch("/preferences", response_model=UserPreferenceOut)
def update_preferences(
    payload: UserPreferenceUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    user = get_or_create_user(db, token)
    prefs = ensure_user_preferences(db, user.id)
    if payload.theme_family is not None:
        prefs.theme_family = payload.theme_family
    if payload.theme_mode is not None:
        prefs.theme_mode = payload.theme_mode
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs
