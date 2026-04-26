import re
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.location_amenity import LocationAmenity
from app.models.organization_amenity import OrganizationAmenity

DEFAULT_AMENITIES = [
    "AC",
    "Coffee",
    "Whiteboard",
    "WiFi",
    "Parking",
    "Printer",
    "Meeting Room",
]

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def clean_amenity_name(name: str) -> str:
    cleaned = " ".join((name or "").split())
    if not cleaned:
        raise HTTPException(status_code=400, detail="Amenity name is required")
    if len(cleaned) > 100:
        raise HTTPException(status_code=400, detail="Amenity name must be 100 characters or fewer")
    return cleaned


def normalize_amenity_name(name: str) -> str:
    return clean_amenity_name(name).casefold()


def slugify_amenity_name(name: str) -> str:
    slug = _SLUG_RE.sub("-", clean_amenity_name(name).casefold()).strip("-")
    return slug or "amenity"


def dedupe_amenity_ids(amenity_ids: list[int] | None) -> list[int]:
    if not amenity_ids:
        return []
    seen: set[int] = set()
    unique_ids: list[int] = []
    for amenity_id in amenity_ids:
        if amenity_id in seen:
            continue
        seen.add(amenity_id)
        unique_ids.append(amenity_id)
    return unique_ids


def list_org_amenities(db: Session, organization_id: int) -> list[OrganizationAmenity]:
    return (
        db.query(OrganizationAmenity)
        .filter(
            OrganizationAmenity.organization_id == organization_id,
            OrganizationAmenity.deleted_at.is_(None),
        )
        .order_by(OrganizationAmenity.name.asc())
        .all()
    )


def _ensure_unique_amenity_name(
    db: Session,
    organization_id: int,
    name: str,
    *,
    exclude_amenity_id: int | None = None,
) -> None:
    normalized_name = normalize_amenity_name(name)
    for amenity in list_org_amenities(db, organization_id):
        if exclude_amenity_id is not None and amenity.id == exclude_amenity_id:
            continue
        if normalize_amenity_name(amenity.name) == normalized_name:
            raise HTTPException(status_code=400, detail="Amenity already exists for this organization")


def seed_default_amenities(db: Session, organization_id: int) -> None:
    existing_names = {
        normalize_amenity_name(amenity.name)
        for amenity in list_org_amenities(db, organization_id)
    }
    for name in DEFAULT_AMENITIES:
        if normalize_amenity_name(name) in existing_names:
            continue
        db.add(
            OrganizationAmenity(
                organization_id=organization_id,
                name=clean_amenity_name(name),
                slug=slugify_amenity_name(name),
            )
        )


def create_amenity(db: Session, organization_id: int, name: str) -> OrganizationAmenity:
    cleaned_name = clean_amenity_name(name)
    _ensure_unique_amenity_name(db, organization_id, cleaned_name)
    amenity = OrganizationAmenity(
        organization_id=organization_id,
        name=cleaned_name,
        slug=slugify_amenity_name(cleaned_name),
    )
    db.add(amenity)
    db.commit()
    db.refresh(amenity)
    return amenity


def update_amenity(
    db: Session,
    organization_id: int,
    amenity_id: int,
    name: str,
) -> OrganizationAmenity:
    amenity = (
        db.query(OrganizationAmenity)
        .filter(
            OrganizationAmenity.id == amenity_id,
            OrganizationAmenity.organization_id == organization_id,
            OrganizationAmenity.deleted_at.is_(None),
        )
        .first()
    )
    if not amenity:
        raise HTTPException(status_code=404, detail="Amenity not found")
    cleaned_name = clean_amenity_name(name)
    _ensure_unique_amenity_name(db, organization_id, cleaned_name, exclude_amenity_id=amenity_id)
    amenity.name = cleaned_name
    amenity.slug = slugify_amenity_name(cleaned_name)
    db.add(amenity)
    db.commit()
    db.refresh(amenity)
    return amenity


def delete_amenity(db: Session, organization_id: int, amenity_id: int) -> None:
    amenity = (
        db.query(OrganizationAmenity)
        .filter(
            OrganizationAmenity.id == amenity_id,
            OrganizationAmenity.organization_id == organization_id,
            OrganizationAmenity.deleted_at.is_(None),
        )
        .first()
    )
    if not amenity:
        raise HTTPException(status_code=404, detail="Amenity not found")
    db.query(LocationAmenity).filter(
        LocationAmenity.organization_amenity_id == amenity.id
    ).delete(synchronize_session=False)
    amenity.deleted_at = datetime.now(timezone.utc)
    db.add(amenity)
    db.commit()


def get_location_amenities_map(
    db: Session,
    location_ids: list[int],
) -> dict[int, list[dict[str, int | str | None]]]:
    if not location_ids:
        return {}
    rows = (
        db.query(
            LocationAmenity.location_id,
            OrganizationAmenity.id,
            OrganizationAmenity.name,
            OrganizationAmenity.slug,
        )
        .join(
            OrganizationAmenity,
            OrganizationAmenity.id == LocationAmenity.organization_amenity_id,
        )
        .filter(
            LocationAmenity.location_id.in_(location_ids),
            OrganizationAmenity.deleted_at.is_(None),
        )
        .order_by(LocationAmenity.location_id.asc(), OrganizationAmenity.name.asc())
        .all()
    )
    grouped: dict[int, list[dict[str, int | str | None]]] = defaultdict(list)
    for row in rows:
        grouped[row.location_id].append(
            {"id": row.id, "name": row.name, "slug": row.slug}
        )
    return dict(grouped)


def location_amenities_text(
    db: Session,
    location_id: int,
    *,
    fallback_text: str | None = None,
) -> str | None:
    amenities = get_location_amenities_map(db, [location_id]).get(location_id, [])
    if amenities:
        return ", ".join(str(item["name"]) for item in amenities)
    return fallback_text


def sync_location_amenities(
    db: Session,
    *,
    organization_id: int,
    location_id: int,
    amenity_ids: list[int] | None,
) -> list[OrganizationAmenity]:
    unique_ids = dedupe_amenity_ids(amenity_ids)
    amenities: list[OrganizationAmenity] = []
    if unique_ids:
        amenities = (
            db.query(OrganizationAmenity)
            .filter(
                OrganizationAmenity.organization_id == organization_id,
                OrganizationAmenity.deleted_at.is_(None),
                OrganizationAmenity.id.in_(unique_ids),
            )
            .all()
        )
        found_ids = {amenity.id for amenity in amenities}
        if len(found_ids) != len(unique_ids):
            raise HTTPException(
                status_code=400,
                detail="One or more amenity IDs do not belong to this organization",
            )

    db.query(LocationAmenity).filter(
        LocationAmenity.location_id == location_id
    ).delete(synchronize_session=False)
    for amenity_id in unique_ids:
        db.add(
            LocationAmenity(
                location_id=location_id,
                organization_amenity_id=amenity_id,
            )
        )
    return amenities
