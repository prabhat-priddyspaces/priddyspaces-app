from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user
from app.db.deps import get_db
from app.models.enums import LocationStatus, SpaceVisibility, UserRole
from app.models.location import Location
from app.models.space import Space
from app.models.space_image import SpaceImage
from app.schemas.media import (
    MediaPresignIn,
    MediaPresignOut,
    SpaceImageCreate,
    SpaceImageOut,
    SpaceImageUpdate,
)
from app.services.auth_user import get_or_create_user
from app.services.authz import require_location_roles
from app.services.storage import presign_space_image_upload

router = APIRouter()


def _space_publicly_visible(space: Space, location: Location | None) -> bool:
    return bool(
        location
        and location.status == LocationStatus.ACTIVE
        and space.visibility != SpaceVisibility.PRIVATE
    )


def _space_with_access(
    db: Session,
    token_payload: dict[str, Any] | None,
    space_public_id: str,
    *,
    allow_customer_read: bool = False,
) -> tuple[Space, Location]:
    space = db.query(Space).filter(Space.public_id == space_public_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    if allow_customer_read and _space_publicly_visible(space, location):
        return space, location

    if token_payload is None:
        raise HTTPException(status_code=404, detail="Space not found")

    user = get_or_create_user(db, token_payload)
    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Space not found",
        status_code=404,
    )

    return space, location


def _image_with_access(db: Session, token_payload: dict, image_public_id: str) -> tuple[SpaceImage, Space, Location]:
    image = db.query(SpaceImage).filter(SpaceImage.public_id == image_public_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    user = get_or_create_user(db, token_payload)
    space = db.query(Space).filter(Space.id == image.space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    location = db.query(Location).filter(Location.id == space.location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")

    require_location_roles(
        db,
        user.id,
        location,
        {UserRole.OWNER, UserRole.ADMIN, UserRole.STAFF},
        detail="Image not found",
        status_code=404,
    )
    return image, space, location


def _normalize_primary_image(db: Session, space_id: int, preferred_image_id: int | None = None) -> None:
    images = (
        db.query(SpaceImage)
        .filter(SpaceImage.space_id == space_id)
        .order_by(
            SpaceImage.is_primary.desc(),
            SpaceImage.sort_order.asc(),
            SpaceImage.created_at.asc(),
        )
        .all()
    )
    if not images:
        return

    if preferred_image_id is not None:
        primary_id = preferred_image_id
    else:
        current_primary = next((image for image in images if image.is_primary), None)
        primary_id = current_primary.id if current_primary else images[0].id

    for image in images:
        image.is_primary = image.id == primary_id
        db.add(image)
    db.commit()


@router.post("/media/presign", response_model=MediaPresignOut)
def presign_media(
    payload: MediaPresignIn,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    _space_with_access(db, token, payload.space_public_id)
    return presign_space_image_upload(payload.filename, payload.content_type)


@router.post("/media", response_model=SpaceImageOut)
def create_media(
    payload: SpaceImageCreate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    space, _location = _space_with_access(db, token, payload.space_public_id)

    existing_count = db.query(SpaceImage).filter(SpaceImage.space_id == space.id).count()
    is_primary = payload.is_primary or existing_count == 0
    image = SpaceImage(
        tenant_id=space.tenant_id,
        space_id=space.id,
        image_url=payload.image_url,
        storage_key=payload.storage_key,
        is_primary=is_primary,
        sort_order=payload.sort_order,
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    if is_primary:
        _normalize_primary_image(db, space.id, image.id)
        db.refresh(image)

    return image


@router.patch("/media/{public_id}", response_model=SpaceImageOut)
def update_media(
    public_id: str,
    payload: SpaceImageUpdate,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    image, space, _location = _image_with_access(db, token, public_id)

    if payload.sort_order is not None:
        image.sort_order = payload.sort_order
    if payload.is_primary is not None:
        image.is_primary = payload.is_primary

    db.add(image)
    db.commit()
    db.refresh(image)

    if payload.is_primary is True:
        _normalize_primary_image(db, space.id, image.id)
    elif payload.is_primary is False and image.is_primary is False:
        _normalize_primary_image(db, space.id)

    db.refresh(image)
    return image


@router.delete("/media/{public_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(
    public_id: str,
    db: Session = Depends(get_db),
    token: dict = Depends(get_current_user),
):
    image, space, _location = _image_with_access(db, token, public_id)
    was_primary = image.is_primary
    db.delete(image)
    db.commit()

    if was_primary:
        _normalize_primary_image(db, space.id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/spaces/{space_public_id}/media", response_model=list[SpaceImageOut])
def list_space_media(
    space_public_id: str,
    db: Session = Depends(get_db),
    token: dict | None = Depends(get_optional_user),
):
    space, _location = _space_with_access(db, token, space_public_id, allow_customer_read=True)
    return (
        db.query(SpaceImage)
        .filter(SpaceImage.space_id == space.id)
        .order_by(
            SpaceImage.is_primary.desc(),
            SpaceImage.sort_order.asc(),
            SpaceImage.created_at.asc(),
        )
        .all()
    )
