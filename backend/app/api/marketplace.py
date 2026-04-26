from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, literal

from app.db.deps import get_db
from app.models.location import Location
from app.models.location_amenity import LocationAmenity
from app.models.organization import Organization
from app.models.organization_amenity import OrganizationAmenity
from app.models.space import Space
from app.models.enums import OrganizationReviewStatus, SpaceVisibility, LocationStatus
from app.models.space_image import SpaceImage
from app.schemas.marketplace import (
    MarketplaceSpaceDetailOut,
    MarketplaceLocationDetailOut,
    MarketplaceLocationSearchOut,
    MarketplaceSpaceOut,
)
from app.services.amenities import get_location_amenities_map
from app.services.public_marketplace import (
    PublicMarketplaceSearchFilters,
    get_public_space_detail,
    get_public_location_detail,
    search_public_locations,
)

router = APIRouter()


@router.get("/marketplace/search", response_model=list[MarketplaceSpaceOut])
def search_marketplace(
    q: str | None = None,
    city: str | None = None,
    space_type: str | None = None,
    min_capacity: int | None = None,
    max_price: int | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    db: Session = Depends(get_db)
):
    dialect = db.bind.dialect.name if db.bind else "postgresql"
    amenity_aggregate = (
        func.string_agg(OrganizationAmenity.name, ", ")
        if dialect == "postgresql"
        else func.group_concat(OrganizationAmenity.name, ", ")
    )
    amenity_subquery = (
        db.query(
            LocationAmenity.location_id.label("location_id"),
            amenity_aggregate.label("amenities"),
        )
        .join(
            OrganizationAmenity,
            OrganizationAmenity.id == LocationAmenity.organization_amenity_id,
        )
        .filter(OrganizationAmenity.deleted_at.is_(None))
        .group_by(LocationAmenity.location_id)
        .subquery()
    )
    amenity_text = func.coalesce(amenity_subquery.c.amenities, Space.amenities, "")

    query = (
        db.query(
            Space.public_id.label("space_public_id"),
            Space.space_type.label("space_type"),
            Space.capacity.label("capacity"),
            Space.price_daily.label("price_daily"),
            Space.price_monthly.label("price_monthly"),
            Space.availability_status.label("availability_status"),
            Space.availability_start_time.label("availability_start_time"),
            Space.availability_end_time.label("availability_end_time"),
            Location.public_id.label("location_public_id"),
            Location.name.label("location_name"),
            Location.address.label("location_address"),
            Location.city.label("location_city"),
            Location.timezone.label("location_timezone"),
            amenity_text.label("amenities"),
            SpaceImage.image_url.label("image_url")
        )
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .outerjoin(amenity_subquery, amenity_subquery.c.location_id == Location.id)
        .outerjoin(SpaceImage, (SpaceImage.space_id == Space.id) & (SpaceImage.is_primary.is_(True)))
    )

    query = query.filter(
        Space.visibility == SpaceVisibility.PUBLIC,
        Location.status == LocationStatus.ACTIVE,
        Organization.review_status == OrganizationReviewStatus.APPROVED,
    )

    if city:
        query = query.filter(Location.city == city)

    if space_type:
        query = query.filter(Space.space_type == space_type)

    if min_capacity:
        query = query.filter(Space.capacity >= min_capacity)

    if max_price:
        query = query.filter(
            (Space.price_daily.is_(None) | (Space.price_daily <= max_price))
            & (Space.price_monthly.is_(None) | (Space.price_monthly <= max_price * 20))
        )

    if q:
        q = q.strip()
        if dialect == "postgresql":
            vector = func.to_tsvector(
                "english",
                func.coalesce(Location.name, "")
                + " "
                + func.coalesce(Location.address, "")
                + " "
                + func.coalesce(Location.city, "")
                + " "
                + func.coalesce(Space.space_type, "")
                + " "
                + amenity_text
            )
            query = query.filter(vector.op("@@")(func.plainto_tsquery("english", q)))
        else:
            ilike = f"%{q}%"
            query = query.filter(
                Location.name.ilike(ilike)
                | Location.address.ilike(ilike)
                | Location.city.ilike(ilike)
                | Space.space_type.ilike(ilike)
                | amenity_text.ilike(ilike)
            )

    distance_expr = None
    if lat is not None and lng is not None:
        if radius_km is None:
            radius_km = 25.0
        query = query.filter(Location.lat.isnot(None), Location.lng.isnot(None))
        distance_expr = (
            6371
            * func.acos(
                func.cos(func.radians(lat))
                * func.cos(func.radians(Location.lat))
                * func.cos(func.radians(Location.lng) - func.radians(lng))
                + func.sin(func.radians(lat)) * func.sin(func.radians(Location.lat))
            )
        )
        query = query.add_columns(distance_expr.label("distance_km"))
        query = query.filter(distance_expr <= radius_km)
    else:
        query = query.add_columns(literal(None).label("distance_km"))

    rows = query.all()
    if not rows:
        return []

    location_ids = [row.location_public_id for row in rows]
    location_id_rows = (
        db.query(Location.id, Location.public_id)
        .filter(Location.public_id.in_(location_ids))
        .all()
    )
    location_public_to_id = {row.public_id: row.id for row in location_id_rows}
    amenity_map = get_location_amenities_map(db, list(location_public_to_id.values()))

    results: list[MarketplaceSpaceOut] = []
    for row in rows:
        location_amenities = amenity_map.get(location_public_to_id.get(row.location_public_id, -1), [])
        amenity_text_value = (
            ", ".join(str(item["name"]) for item in location_amenities)
            if location_amenities
            else row.amenities
        )
        results.append(
            MarketplaceSpaceOut(
                space_public_id=row.space_public_id,
                space_type=row.space_type,
                capacity=row.capacity,
                price_daily=row.price_daily,
                price_monthly=row.price_monthly,
                availability_status=row.availability_status,
                availability_start_time=row.availability_start_time.isoformat() if row.availability_start_time else None,
                availability_end_time=row.availability_end_time.isoformat() if row.availability_end_time else None,
                location_public_id=row.location_public_id,
                location_name=row.location_name,
                location_address=row.location_address,
                location_city=row.location_city,
                location_timezone=row.location_timezone,
                amenities=amenity_text_value,
                image_url=row.image_url,
                distance_km=row.distance_km
            )
        )
    return results


@router.get("/marketplace/locations", response_model=MarketplaceLocationSearchOut)
def search_marketplace_locations(
    category: str,
    q: str | None = None,
    date: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    capacity: int | None = None,
    max_price: int | None = None,
    amenities: str | None = None,
    sort: str | None = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    return search_public_locations(
        db,
        PublicMarketplaceSearchFilters(
            category=category,
            q=q,
            date=date,
            start_time=start_time,
            end_time=end_time,
            capacity=capacity,
            max_price=max_price,
            amenities=amenities,
            sort=sort,
            page=page,
            page_size=page_size,
        ),
    )


@router.get("/marketplace/locations/{location_public_id}", response_model=MarketplaceLocationDetailOut)
def get_marketplace_location_detail(
    location_public_id: str,
    category: str,
    q: str | None = None,
    date: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    capacity: int | None = None,
    max_price: int | None = None,
    amenities: str | None = None,
    sort: str | None = None,
    db: Session = Depends(get_db),
):
    return get_public_location_detail(
        db,
        location_public_id=location_public_id,
        filters=PublicMarketplaceSearchFilters(
            category=category,
            q=q,
            date=date,
            start_time=start_time,
            end_time=end_time,
            capacity=capacity,
            max_price=max_price,
            amenities=amenities,
            sort=sort,
        ),
    )


@router.get("/marketplace/spaces/{space_public_id}", response_model=MarketplaceSpaceDetailOut)
def get_marketplace_space_detail(
    space_public_id: str,
    db: Session = Depends(get_db),
):
    return get_public_space_detail(db, space_public_id=space_public_id)
