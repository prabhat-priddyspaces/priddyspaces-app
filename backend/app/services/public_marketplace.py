from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.cancellation_policy import CancellationPolicy
from app.models.cancellation_policy_tier import CancellationPolicyTier
from app.models.enums import AvailabilityStatus, LocationStatus, OrganizationReviewStatus, SpaceType, SpaceVisibility, UserRole
from app.models.location import Location
from app.models.membership_plan import MembershipPlan
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.space_image import SpaceImage
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.schemas.working_hours import effective_public_working_hours
from app.services.amenities import get_location_amenities_map
from app.services.booking_inventory import expand_occurrences, resolve_tz, validate_occurrences_available
from app.services.booking_products import booking_products_for_space
from app.services.money import CENT, to_money_decimal
from app.services.owner_payments import space_payment_is_marketplace_ready


CATEGORY_SPACE_TYPES = {
    "coworking": SpaceType.SHARED_DESK,
    "private_office": SpaceType.PRIVATE_OFFICE,
    "meeting_room": SpaceType.CONFERENCE_ROOM,
}

DEFAULT_SORT = {
    "coworking": "price_asc",
    "private_office": "price_asc",
    "meeting_room": "price_asc",
}

EARTH_RADIUS_MILES = 3958.7613


@dataclass
class PublicMarketplaceSearchFilters:
    category: str
    q: str | None = None
    date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    capacity: int | None = None
    max_price: int | None = None
    amenities: str | None = None
    sort: str | None = None
    lat: float | None = None
    lng: float | None = None
    radius_miles: float | None = None
    page: int = 1
    page_size: int = 20


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlng1, rlat2, rlng2 = (math.radians(v) for v in (lat1, lng1, lat2, lng2))
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(min(1.0, math.sqrt(a)))


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    seen: set[str] = set()
    items: list[str] = []
    for raw in value.split(","):
        cleaned = " ".join(raw.split())
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        items.append(cleaned)
    return items


def _normalize_tokens(values: list[str]) -> list[str]:
    return [value.casefold() for value in values]


def _clean_query(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="date must be in YYYY-MM-DD format") from exc


def _parse_time(value: str | None, field_name: str) -> time | None:
    if not value:
        return None
    try:
        return time.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be in HH:MM or HH:MM:SS format") from exc


def _validate_filters(filters: PublicMarketplaceSearchFilters) -> tuple[date | None, time | None, time | None]:
    if filters.category not in CATEGORY_SPACE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported marketplace category")

    parsed_date = _parse_date(filters.date)
    parsed_start = _parse_time(filters.start_time, "start_time")
    parsed_end = _parse_time(filters.end_time, "end_time")

    if filters.category == "meeting_room" and (parsed_start or parsed_end):
        if not parsed_start or not parsed_end:
            raise HTTPException(status_code=400, detail="start_time and end_time are required together")
        if parsed_end <= parsed_start:
            raise HTTPException(status_code=400, detail="end_time must be after start_time")

    if filters.page < 1:
        raise HTTPException(status_code=400, detail="page must be 1 or greater")
    if filters.page_size < 1:
        raise HTTPException(status_code=400, detail="page_size must be 1 or greater")
    if filters.page_size > 100:
        raise HTTPException(status_code=400, detail="page_size must be 100 or fewer")

    if (filters.lat is None) != (filters.lng is None):
        raise HTTPException(status_code=400, detail="lat and lng must be provided together")
    if filters.lat is not None and not -90 <= filters.lat <= 90:
        raise HTTPException(status_code=400, detail="lat must be between -90 and 90")
    if filters.lng is not None and not -180 <= filters.lng <= 180:
        raise HTTPException(status_code=400, detail="lng must be between -180 and 180")
    if filters.radius_miles is not None:
        if filters.lat is None or filters.lng is None:
            raise HTTPException(status_code=400, detail="radius_miles requires lat and lng")
        if filters.radius_miles <= 0 or filters.radius_miles > 1000:
            raise HTTPException(status_code=400, detail="radius_miles must be between 1 and 1000")

    return parsed_date, parsed_start, parsed_end


def _location_amenity_names(
    location: Location,
    amenity_map: dict[int, list[dict[str, int | str | None]]],
) -> list[str]:
    mapped = amenity_map.get(location.id, [])
    if mapped:
        return [str(item["name"]) for item in mapped if item.get("name")]
    return _split_csv(location.amenities)


def _space_amenity_names(space: Space) -> list[str]:
    return _split_csv(space.amenities)


def _space_display_name(space: Space) -> str:
    cleaned = (space.name or "").strip()
    if cleaned:
        return cleaned
    return " ".join(part.capitalize() for part in space.space_type.value.split("_"))


def _split_lines(value: str | None) -> list[str]:
    if not value:
        return []
    return [line for line in (" ".join(part.split()) for part in value.splitlines()) if line]


def _space_publicly_visible(space: Space, location: Location) -> bool:
    return bool(
        location.status == LocationStatus.ACTIVE
        and space.availability_status == AvailabilityStatus.AVAILABLE
        and space.visibility != SpaceVisibility.PRIVATE
    )


def _user_display_name(user: User) -> str | None:
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    parts = [part.strip() for part in [user.first_name or "", user.last_name or ""] if part and part.strip()]
    if parts:
        return " ".join(parts)
    return None


def _contact_title(role: UserRole) -> str:
    if role == UserRole.OWNER:
        return "Owner"
    if role == UserRole.ADMIN:
        return "Admin"
    return "Team"


def _space_hourly_prices(
    space_id: int,
    pricing_rules_map: dict[int, list[int]],
    space_price_hourly: int | None = None,
) -> list[int]:
    """Surface hourly prices for the marketplace.

    Combines Space.price_hourly (the simple per-space field set in the owner UI) with
    PricingRule rows (time-windowed promo overrides). Both sources show as "starting
    hourly price" candidates so the lowest wins on the search card.
    """
    prices = list(pricing_rules_map.get(space_id, []))
    if space_price_hourly is not None:
        prices.append(space_price_hourly)
    return prices


def _space_membership_prices(
    tenant_id: int,
    space_type: SpaceType,
    subscription_price_map: dict[tuple[int, str], list[int]],
) -> list[int]:
    return subscription_price_map.get((tenant_id, space_type.value), [])


def _space_matches_time_window(
    space: Space,
    *,
    category: str,
    requested_start: time | None,
    requested_end: time | None,
) -> bool:
    if category != "meeting_room":
        return True
    if requested_start is None or requested_end is None:
        return True
    if space.availability_status != AvailabilityStatus.AVAILABLE:
        return False
    if space.availability_start_time and requested_start < space.availability_start_time:
        return False
    if space.availability_end_time and requested_end > space.availability_end_time:
        return False
    return True


def _space_available_for_requested_window(
    db: Session,
    *,
    space: Space,
    location: Location,
    category: str,
    requested_date: date | None,
    requested_start: time | None,
    requested_end: time | None,
) -> bool:
    if category != "meeting_room" or requested_date is None or requested_start is None or requested_end is None:
        return True

    tz = resolve_tz(location.timezone)
    start_datetime = datetime.combine(requested_date, requested_start, tzinfo=tz)
    end_datetime = datetime.combine(requested_date, requested_end, tzinfo=tz)
    try:
        occurrences = expand_occurrences(
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            location=location,
            space=space,
        )
        validate_occurrences_available(
            db,
            space=space,
            location=location,
            occurrences=occurrences,
            booking_mode="hourly",
            full_day=False,
            seats_requested=1,
        )
    except HTTPException:
        return False
    return True


def _query_tokens(q: str | None) -> list[str]:
    """Split a freeform location query into tokens that must each match.

    "New York, NY" → ["new york", "ny"] so the query can match a row whose
    city is "New York" and state is "NY" stored in separate columns.
    """
    if not q:
        return []
    tokens: list[str] = []
    for chunk in q.split(","):
        cleaned = " ".join(chunk.split())
        if cleaned:
            tokens.append(cleaned.casefold())
    if not tokens:
        cleaned = " ".join(q.split())
        if cleaned:
            tokens.append(cleaned.casefold())
    return tokens


def _query_score(
    q: str | None,
    *,
    location: Location,
    location_amenities: list[str],
    space_amenities: list[str],
) -> int:
    tokens = _query_tokens(q)
    if not tokens:
        return 0
    field_weights: tuple[tuple[str | None, int], ...] = (
        (location.name, 5),
        (location.neighborhood, 4),
        (location.city, 3),
        (location.state, 3),
        (location.address, 2),
        (location.postal_code, 2),
    )
    total = 0
    for token in tokens:
        best = 0
        for value, weight in field_weights:
            if value and token in value.casefold():
                best = max(best, weight)
        if any(token in amenity.casefold() for amenity in location_amenities):
            best = max(best, 3)
        if any(token in amenity.casefold() for amenity in space_amenities):
            best = max(best, 2)
        if best == 0:
            return 0
        total += best
    return total


def _space_matches_query(
    q: str | None,
    *,
    location: Location,
    location_amenities: list[str],
    space_amenities: list[str],
) -> bool:
    if not q:
        return True
    return _query_score(
        q,
        location=location,
        location_amenities=location_amenities,
        space_amenities=space_amenities,
    ) > 0


def _matches_requested_amenities(
    requested_amenities: list[str],
    *,
    location_amenities: list[str],
    space_amenities: list[str],
) -> bool:
    if not requested_amenities:
        return True
    haystack = " ".join(location_amenities + space_amenities).casefold()
    return all(token in haystack for token in requested_amenities)


def _active_hourly_pricing_map(db: Session, space_ids: list[int]) -> dict[int, list[int]]:
    if not space_ids:
        return {}
    now = datetime.now(timezone.utc)
    rows = (
        db.query(PricingRule)
        .filter(
            PricingRule.space_id.in_(space_ids),
            PricingRule.rate_type == "hourly",
        )
        .all()
    )
    prices: dict[int, list[int]] = defaultdict(list)
    for row in rows:
        if row.active_from and row.active_from.replace(tzinfo=timezone.utc) > now:
            continue
        if row.active_to and row.active_to.replace(tzinfo=timezone.utc) < now:
            continue
        prices[row.space_id].append(to_money_decimal(row.rate_amount).quantize(CENT))
    return dict(prices)


def _subscription_price_map(
    db: Session,
    tenant_ids: list[int],
    *,
    space_type: SpaceType,
) -> dict[tuple[int, str], list[int]]:
    if not tenant_ids:
        return {}
    rows = (
        db.query(SubscriptionPlan)
        .filter(
            SubscriptionPlan.tenant_id.in_(tenant_ids),
            SubscriptionPlan.space_type == space_type,
            SubscriptionPlan.is_active.is_(True),
        )
        .all()
    )
    prices: dict[tuple[int, str], list[int]] = defaultdict(list)
    for row in rows:
        prices[(row.tenant_id, row.space_type.value)].append(row.price)

    plan_modes = {
        SpaceType.SHARED_DESK: {"monthly_membership"},
        SpaceType.VIRTUAL_OFFICE: {"virtual_membership"},
        SpaceType.PRIVATE_OFFICE: {"private_office_lease"},
        SpaceType.SUITE: {"suite_lease"},
    }.get(space_type, set())
    if plan_modes:
        plan_rows = (
            db.query(MembershipPlan)
            .filter(
                MembershipPlan.tenant_id.in_(tenant_ids),
                MembershipPlan.booking_mode.in_(plan_modes),
                MembershipPlan.is_active.is_(True),
            )
            .all()
        )
        for plan in plan_rows:
            prices[(plan.tenant_id, space_type.value)].append(int(plan.price_cents / 100))
    return dict(prices)


def _best_space_price(space_payload: dict[str, object], *, category: str) -> int | None:
    if category == "coworking":
        return (
            space_payload.get("starting_day_pass_price")
            or space_payload.get("starting_membership_price")
            or space_payload.get("starting_hourly_price")
        )
    if category == "private_office":
        return space_payload.get("starting_monthly_price")
    return (
        space_payload.get("starting_hourly_price")
        or space_payload.get("starting_day_pass_price")
        or space_payload.get("starting_monthly_price")
    )


def _space_card_price(
    *,
    category: str,
    space: Space,
    hourly_prices: list[int],
    membership_prices: list[int],
) -> int | None:
    if category == "coworking":
        return space.price_daily or (min(membership_prices) if membership_prices else None)
    if category == "private_office":
        return min(membership_prices) if membership_prices else space.price_monthly
    if hourly_prices:
        return min(hourly_prices)
    return space.price_daily or space.price_monthly


def _sort_key(
    category: str,
    item: dict[str, object],
    *,
    query_present: bool,
    sort: str | None,
    distance_present: bool,
) -> tuple[object, ...]:
    if sort:
        selected_sort = sort
    elif distance_present:
        selected_sort = "distance"
    elif query_present:
        selected_sort = "relevance"
    else:
        selected_sort = DEFAULT_SORT[category]
    price = _best_space_price(item, category=category)
    if selected_sort == "price_desc":
        return (-1 if price is None else 0, -(price or 0), str(item["name"]).casefold())
    if selected_sort == "name":
        return (str(item["name"]).casefold(),)
    if selected_sort == "relevance":
        return (-int(item["_relevance"]), 1 if price is None else 0, price or 0, str(item["name"]).casefold())
    if selected_sort == "distance":
        distance = item.get("distance_miles")
        return (1 if distance is None else 0, distance or 0.0, str(item["name"]).casefold())
    return (1 if price is None else 0, price or 0, str(item["name"]).casefold())


def _serialize_space_time(value: time | None) -> str | None:
    return value.isoformat() if value else None


def _build_location_payload(
    *,
    location: Location,
    location_amenities: list[str],
    organization: Organization | None = None,
    distance_miles: float | None = None,
) -> dict[str, object]:
    working_hours_enabled, working_hours = effective_public_working_hours(
        enabled=location.public_working_hours_enabled,
        hours=location.public_working_hours,
        legacy_weekdays=location.public_hours_weekdays,
        legacy_weekends=location.public_hours_weekends,
    )

    return {
        "location_public_id": location.public_id,
        "booking_approval_mode": (organization.booking_approval_mode if organization else "manual") or "manual",
        "payment_failure_hold_minutes": organization.payment_failure_hold_minutes if organization else None,
        "name": location.name,
        "address": location.address,
        "city": location.city,
        "state": location.state,
        "postal_code": location.postal_code,
        "neighborhood": location.neighborhood,
        "timezone": location.timezone,
        "lat": location.lat,
        "lng": location.lng,
        "location_amenities": location_amenities,
        "matching_space_count": 0,
        "featured_space_public_id": None,
        "featured_image_url": None,
        "starting_day_pass_price": None,
        "starting_monthly_price": None,
        "starting_hourly_price": None,
        "starting_membership_price": None,
        "distance_miles": distance_miles,
        "public_working_hours_enabled": working_hours_enabled,
        "public_working_hours": working_hours,
        "_relevance": 0,
        "_spaces": [],
    }


def _maybe_update_min(payload: dict[str, object], key: str, value: int | None) -> None:
    if value is None:
        return
    current = payload.get(key)
    if current is None or value < current:
        payload[key] = value


def _public_inventory_rows(
    db: Session,
    *,
    category: str,
    require_coordinates: bool,
) -> list[tuple[Space, Location, SpaceImage | None]]:
    query = (
        db.query(Space, Location, SpaceImage)
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .outerjoin(SpaceImage, (SpaceImage.space_id == Space.id) & (SpaceImage.is_primary.is_(True)))
        .filter(
            Space.visibility == SpaceVisibility.PUBLIC,
            Space.availability_status == AvailabilityStatus.AVAILABLE,
            Space.space_type == CATEGORY_SPACE_TYPES[category],
            Location.status == LocationStatus.ACTIVE,
            Organization.review_status == OrganizationReviewStatus.APPROVED,
        )
    )
    if require_coordinates:
        query = query.filter(Location.lat.isnot(None), Location.lng.isnot(None))
    return [
        (space, location, image)
        for space, location, image in query.all()
        if space_payment_is_marketplace_ready(db, space)
    ]


def search_public_locations(db: Session, filters: PublicMarketplaceSearchFilters) -> dict[str, object]:
    parsed_date, parsed_start, parsed_end = _validate_filters(filters)
    query = _clean_query(filters.q)
    rows = _public_inventory_rows(db, category=filters.category, require_coordinates=False)
    if not rows:
        return {"meta": {"total_locations": 0, "page": filters.page, "page_size": filters.page_size}, "results": []}

    space_ids = [space.id for space, _, _ in rows]
    tenant_ids = list({space.tenant_id for space, _, _ in rows})
    location_ids = list({location.id for _, location, _ in rows})
    orgs_by_id = {
        organization.id: organization
        for organization in db.query(Organization).filter(Organization.id.in_(tenant_ids)).all()
    } if tenant_ids else {}
    location_amenity_map = get_location_amenities_map(db, location_ids)
    hourly_pricing_map = _active_hourly_pricing_map(db, space_ids)
    subscription_prices = _subscription_price_map(
        db,
        tenant_ids,
        space_type=CATEGORY_SPACE_TYPES[filters.category],
    )
    requested_amenities = _normalize_tokens(_split_csv(filters.amenities))
    radius_active = (
        filters.radius_miles is not None
        and filters.lat is not None
        and filters.lng is not None
    )

    grouped: dict[str, dict[str, object]] = {}
    for space, location, image in rows:
        location_amenities = _location_amenity_names(location, location_amenity_map)
        space_amenities = _space_amenity_names(space)
        if filters.capacity is not None and space.capacity < filters.capacity:
            continue
        if not _space_matches_query(
            query,
            location=location,
            location_amenities=location_amenities,
            space_amenities=space_amenities,
        ):
            continue
        if not _matches_requested_amenities(
            requested_amenities,
            location_amenities=location_amenities,
            space_amenities=space_amenities,
        ):
            continue

        distance_miles: float | None = None
        if filters.lat is not None and filters.lng is not None and location.lat is not None and location.lng is not None:
            distance_miles = _haversine_miles(filters.lat, filters.lng, location.lat, location.lng)
        if radius_active:
            if distance_miles is None or distance_miles > filters.radius_miles:
                continue

        hourly_prices = _space_hourly_prices(space.id, hourly_pricing_map, space.price_hourly)
        membership_prices = _space_membership_prices(space.tenant_id, space.space_type, subscription_prices)
        product_prices = [
            int((product.get("price_cents") or 0) / 100)
            for product in booking_products_for_space(db, space)
            if product.get("booking_mode") in {
                "monthly_membership",
                "virtual_membership",
                "private_office_lease",
                "suite_lease",
            }
            and product.get("price_cents")
        ]
        if product_prices:
            membership_prices = product_prices
        if not _space_matches_time_window(
            space,
            category=filters.category,
            requested_start=parsed_start,
            requested_end=parsed_end,
        ):
            continue
        if not _space_available_for_requested_window(
            db,
            space=space,
            location=location,
            category=filters.category,
            requested_date=parsed_date,
            requested_start=parsed_start,
            requested_end=parsed_end,
        ):
            continue

        comparable_price = _space_card_price(
            category=filters.category,
            space=space,
            hourly_prices=hourly_prices,
            membership_prices=membership_prices,
        )
        if filters.max_price is not None and comparable_price is not None and comparable_price > filters.max_price:
            continue

        payload = grouped.setdefault(
            location.public_id,
            _build_location_payload(
                location=location,
                location_amenities=location_amenities,
                organization=orgs_by_id.get(location.organization_id),
                distance_miles=round(distance_miles, 2) if distance_miles is not None else None,
            ),
        )
        payload["matching_space_count"] = int(payload["matching_space_count"]) + 1
        payload["_relevance"] = max(
            int(payload["_relevance"]),
            _query_score(
                query,
                location=location,
                location_amenities=location_amenities,
                space_amenities=space_amenities,
            ),
        )
        if image and image.image_url and not payload["featured_image_url"]:
            payload["featured_image_url"] = image.image_url
        if payload["featured_space_public_id"] is None:
            payload["featured_space_public_id"] = space.public_id

        _maybe_update_min(payload, "starting_day_pass_price", space.price_daily)
        _maybe_update_min(payload, "starting_monthly_price", space.price_monthly)
        _maybe_update_min(payload, "starting_hourly_price", min(hourly_prices) if hourly_prices else None)
        _maybe_update_min(
            payload,
            "starting_membership_price",
            min(membership_prices) if membership_prices else None,
        )
        payload["_spaces"].append(
            {
                "public_id": space.public_id,
                "name": _space_display_name(space),
                "space_type": space.space_type.value,
                "capacity": space.capacity,
                "availability_status": space.availability_status.value,
                "availability_start_time": _serialize_space_time(space.availability_start_time),
                "availability_end_time": _serialize_space_time(space.availability_end_time),
                "price_daily": space.price_daily,
                "price_monthly": space.price_monthly,
                "hourly_price": min(hourly_prices) if hourly_prices else None,
                "membership_price": min(membership_prices) if membership_prices else None,
                "amenities": location_amenities or space_amenities,
                "image_url": image.image_url if image else None,
            }
        )

    results = list(grouped.values())
    results.sort(
        key=lambda item: _sort_key(
            filters.category,
            item,
            query_present=bool(query),
            sort=filters.sort,
            distance_present=radius_active,
        )
    )
    total_locations = len(results)
    start_index = (filters.page - 1) * filters.page_size
    paged = results[start_index:start_index + filters.page_size]
    for item in paged:
        item.pop("_relevance", None)
        item["spaces"] = item.pop("_spaces", [])
    return {
        "meta": {
            "total_locations": total_locations,
            "page": filters.page,
            "page_size": filters.page_size,
        },
        "results": paged,
    }


def get_public_location_detail(
    db: Session,
    *,
    location_public_id: str,
    filters: PublicMarketplaceSearchFilters,
) -> dict[str, object]:
    parsed_date, parsed_start, parsed_end = _validate_filters(filters)
    query = _clean_query(filters.q)
    rows = _public_inventory_rows(db, category=filters.category, require_coordinates=False)
    filtered_rows = [
        (space, location, image)
        for space, location, image in rows
        if location.public_id == location_public_id
    ]
    if not filtered_rows:
        raise HTTPException(status_code=404, detail="Marketplace location not found")

    space_ids = [space.id for space, _, _ in filtered_rows]
    tenant_ids = list({space.tenant_id for space, _, _ in filtered_rows})
    location = filtered_rows[0][1]
    location_amenity_map = get_location_amenities_map(db, [location.id])
    location_amenities = _location_amenity_names(location, location_amenity_map)
    hourly_pricing_map = _active_hourly_pricing_map(db, space_ids)
    subscription_prices = _subscription_price_map(
        db,
        tenant_ids,
        space_type=CATEGORY_SPACE_TYPES[filters.category],
    )
    requested_amenities = _normalize_tokens(_split_csv(filters.amenities))

    spaces: list[dict[str, object]] = []
    organization = db.query(Organization).filter(Organization.id == location.organization_id).first()
    payload = _build_location_payload(
        location=location,
        location_amenities=location_amenities,
        organization=organization,
    )
    for space, _, image in filtered_rows:
        space_amenities = _space_amenity_names(space)
        if filters.capacity is not None and space.capacity < filters.capacity:
            continue
        if not _space_matches_query(
            query,
            location=location,
            location_amenities=location_amenities,
            space_amenities=space_amenities,
        ):
            continue
        if not _matches_requested_amenities(
            requested_amenities,
            location_amenities=location_amenities,
            space_amenities=space_amenities,
        ):
            continue
        hourly_prices = _space_hourly_prices(space.id, hourly_pricing_map, space.price_hourly)
        membership_prices = _space_membership_prices(space.tenant_id, space.space_type, subscription_prices)
        product_prices = [
            int((product.get("price_cents") or 0) / 100)
            for product in booking_products_for_space(db, space)
            if product.get("booking_mode") in {
                "monthly_membership",
                "virtual_membership",
                "private_office_lease",
                "suite_lease",
            }
            and product.get("price_cents")
        ]
        if product_prices:
            membership_prices = product_prices
        if not _space_matches_time_window(
            space,
            category=filters.category,
            requested_start=parsed_start,
            requested_end=parsed_end,
        ):
            continue
        if not _space_available_for_requested_window(
            db,
            space=space,
            location=location,
            category=filters.category,
            requested_date=parsed_date,
            requested_start=parsed_start,
            requested_end=parsed_end,
        ):
            continue
        comparable_price = _space_card_price(
            category=filters.category,
            space=space,
            hourly_prices=hourly_prices,
            membership_prices=membership_prices,
        )
        if filters.max_price is not None and comparable_price is not None and comparable_price > filters.max_price:
            continue

        payload["matching_space_count"] = int(payload["matching_space_count"]) + 1
        payload["featured_space_public_id"] = payload["featured_space_public_id"] or space.public_id
        if image and image.image_url and not payload["featured_image_url"]:
            payload["featured_image_url"] = image.image_url
        _maybe_update_min(payload, "starting_day_pass_price", space.price_daily)
        _maybe_update_min(payload, "starting_monthly_price", space.price_monthly)
        _maybe_update_min(payload, "starting_hourly_price", min(hourly_prices) if hourly_prices else None)
        _maybe_update_min(
            payload,
            "starting_membership_price",
            min(membership_prices) if membership_prices else None,
        )

        spaces.append(
            {
                "public_id": space.public_id,
                "name": _space_display_name(space),
                "space_type": space.space_type.value,
                "capacity": space.capacity,
                "availability_status": space.availability_status.value,
                "availability_start_time": _serialize_space_time(space.availability_start_time),
                "availability_end_time": _serialize_space_time(space.availability_end_time),
                "price_daily": space.price_daily,
                "price_monthly": space.price_monthly,
                "hourly_price": min(hourly_prices) if hourly_prices else None,
                "membership_price": min(membership_prices) if membership_prices else None,
                "amenities": location_amenities or space_amenities,
                "image_url": image.image_url if image else None,
            }
        )

    if not spaces:
        raise HTTPException(status_code=404, detail="Marketplace location not found")

    def _space_detail_price(item: dict[str, object]) -> int | None:
        if filters.category == "coworking":
            return item["price_daily"] or item["membership_price"]
        if filters.category == "private_office":
            return item["membership_price"] or item["price_monthly"]
        return item["hourly_price"] or item["price_daily"] or item["price_monthly"]

    spaces.sort(
        key=lambda item: (
            1 if _space_detail_price(item) is None else 0,
            _space_detail_price(item) or 0,
            str(item["public_id"]),
        )
    )
    payload.pop("_relevance", None)
    payload.pop("_spaces", None)
    payload["spaces"] = spaces
    return payload


def get_public_space_detail(
    db: Session,
    *,
    space_public_id: str,
) -> dict[str, object]:
    row = (
        db.query(Space, Location, Organization)
        .join(Location, Location.id == Space.location_id)
        .join(Organization, Organization.id == Location.organization_id)
        .filter(Space.public_id == space_public_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Marketplace space not found")

    space, location, organization = row
    if (
        not _space_publicly_visible(space, location)
        or organization.review_status != OrganizationReviewStatus.APPROVED
        or not space_payment_is_marketplace_ready(db, space)
    ):
        raise HTTPException(status_code=404, detail="Marketplace space not found")

    location_amenity_map = get_location_amenities_map(db, [location.id])
    location_amenities = _location_amenity_names(location, location_amenity_map)
    space_amenities = _space_amenity_names(space)
    images = (
        db.query(SpaceImage)
        .filter(SpaceImage.space_id == space.id)
        .order_by(
            SpaceImage.is_primary.desc(),
            SpaceImage.sort_order.asc(),
            SpaceImage.created_at.asc(),
        )
        .all()
    )
    hourly_pricing_map = _active_hourly_pricing_map(db, [space.id])
    subscription_prices = _subscription_price_map(
        db,
        [space.tenant_id],
        space_type=space.space_type,
    )
    hourly_prices = _space_hourly_prices(space.id, hourly_pricing_map, space.price_hourly)
    membership_prices = _space_membership_prices(space.tenant_id, space.space_type, subscription_prices)
    booking_products = booking_products_for_space(db, space)
    product_monthly_prices = [
        int((product.get("price_cents") or 0) / 100)
        for product in booking_products
        if product.get("booking_mode") in {
            "monthly_membership",
            "virtual_membership",
            "private_office_lease",
            "suite_lease",
        }
        and product.get("price_cents")
    ]
    product_membership_price = min(product_monthly_prices) if product_monthly_prices else None

    from app.models.space_volume_discount import SpaceVolumeDiscount
    volume_tiers = (
        db.query(SpaceVolumeDiscount)
        .filter(
            SpaceVolumeDiscount.space_id == space.id,
            SpaceVolumeDiscount.is_active.is_(True),
        )
        .order_by(SpaceVolumeDiscount.min_hours.asc())
        .all()
    )
    volume_discount_payload = [
        {"min_hours": tier.min_hours, "discount_percent": tier.discount_percent}
        for tier in volume_tiers
    ]

    cancellation_policy = (
        db.query(CancellationPolicy)
        .filter(
            CancellationPolicy.tenant_id == space.tenant_id,
            CancellationPolicy.space_type == space.space_type.value,
        )
        .order_by(CancellationPolicy.id.desc())
        .first()
    )
    cancellation_tiers = []
    if cancellation_policy:
        cancellation_tiers = (
            db.query(CancellationPolicyTier)
            .filter(CancellationPolicyTier.cancellation_policy_id == cancellation_policy.id)
            .order_by(CancellationPolicyTier.min_hours_before_start.desc())
            .all()
        )
    contact_rows = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(
            OrganizationMember.organization_id == location.organization_id,
            OrganizationMember.is_active.is_(True),
            OrganizationMember.role.in_([UserRole.OWNER, UserRole.ADMIN]),
        )
        .all()
    )
    role_priority = {UserRole.OWNER: 0, UserRole.ADMIN: 1}
    support_contacts: list[dict[str, str]] = []
    seen_contacts: set[str] = set()
    for member, user in sorted(
        contact_rows,
        key=lambda item: (role_priority.get(item[0].role, 99), item[0].id),
    ):
        name = _user_display_name(user)
        if not name:
            continue
        dedupe_key = name.casefold()
        if dedupe_key in seen_contacts:
            continue
        seen_contacts.add(dedupe_key)
        support_contacts.append({"name": name, "title": _contact_title(member.role)})
        if len(support_contacts) == 2:
            break

    amenities = location_amenities or space_amenities
    working_hours_enabled, working_hours = effective_public_working_hours(
        enabled=location.public_working_hours_enabled,
        hours=location.public_working_hours,
        legacy_weekdays=location.public_hours_weekdays,
        legacy_weekends=location.public_hours_weekends,
    )
    return {
        "space": {
            "public_id": space.public_id,
            "name": _space_display_name(space),
            "space_type": space.space_type.value,
            "capacity": space.capacity,
            "availability_status": space.availability_status.value,
            "availability_start_time": _serialize_space_time(space.availability_start_time),
            "availability_end_time": _serialize_space_time(space.availability_end_time),
            "buffer_before_minutes": space.buffer_before_minutes or 0,
            "buffer_after_minutes": space.buffer_after_minutes or 0,
            "price_daily": space.price_daily,
            "price_monthly": space.price_monthly,
            "hourly_price": min(hourly_prices) if hourly_prices else None,
            "membership_price": product_membership_price or (min(membership_prices) if membership_prices else None),
            "amenities": amenities,
            "volume_discounts": volume_discount_payload,
            "booking_products": booking_products,
        },
        "images": [
            {
                "public_id": image.public_id,
                "image_url": image.image_url,
                "is_primary": image.is_primary,
                "sort_order": image.sort_order,
            }
            for image in images
        ],
        "location": {
            "location_public_id": location.public_id,
            "organization_name": organization.name,
            "booking_approval_mode": organization.booking_approval_mode or "manual",
            "payment_failure_hold_minutes": organization.payment_failure_hold_minutes,
            "name": location.name,
            "address": location.address,
            "city": location.city,
            "state": location.state,
            "postal_code": location.postal_code,
            "neighborhood": location.neighborhood,
            "timezone": location.timezone,
            "lat": location.lat,
            "lng": location.lng,
            "public_phone": location.public_phone,
            "public_email": location.public_email,
            "public_hours_weekdays": location.public_hours_weekdays,
            "public_hours_weekends": location.public_hours_weekends,
            "public_working_hours_enabled": working_hours_enabled,
            "public_working_hours": working_hours,
            "public_parking_notes": _split_lines(location.public_parking_notes),
            "public_transit_notes": _split_lines(location.public_transit_notes),
            "public_included_items": _split_lines(location.public_included_items),
        },
        "cancellation_policy": (
            {
                "cancel_window_hours": cancellation_policy.cancel_window_hours,
                "refund_percent": cancellation_policy.refund_percent,
                "tiers": [
                    {
                        "min_hours_before_start": tier.min_hours_before_start,
                        "refund_percent": tier.refund_percent,
                    }
                    for tier in cancellation_tiers
                ]
                or [
                    {
                        "min_hours_before_start": cancellation_policy.cancel_window_hours,
                        "refund_percent": cancellation_policy.refund_percent,
                    }
                ],
            }
            if cancellation_policy
            else None
        ),
        "support_contacts": support_contacts,
    }
