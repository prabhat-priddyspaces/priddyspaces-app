from datetime import time

from fastapi.testclient import TestClient

from app.db.deps import get_db
from app.main import app
from app.models.enums import (
    AvailabilityStatus,
    BillingCycle,
    LocationStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.cancellation_policy import CancellationPolicy
from app.models.user import User
from app.models.location_amenity import LocationAmenity
from app.models.organization import Organization
from app.models.organization_amenity import OrganizationAmenity
from app.models.organization_member import OrganizationMember
from app.models.location import Location
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.space_image import SpaceImage
from app.models.subscription_plan import SubscriptionPlan


def _seed_spaces(db):
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db.add(member)

    active_loc = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Active",
        address="123 Main",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.ACTIVE
    )
    inactive_loc = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Inactive",
        address="456 Side",
        city="Testville",
        timezone="UTC",
        status=LocationStatus.INACTIVE
    )
    db.add(active_loc)
    db.add(inactive_loc)
    db.commit()
    db.refresh(active_loc)
    db.refresh(inactive_loc)

    wifi = OrganizationAmenity(
        organization_id=org.id,
        name="WiFi",
        slug="wifi",
    )
    coffee = OrganizationAmenity(
        organization_id=org.id,
        name="Coffee",
        slug="coffee",
    )
    db.add(wifi)
    db.add(coffee)
    db.commit()
    db.refresh(wifi)
    db.refresh(coffee)
    db.add(LocationAmenity(location_id=active_loc.id, organization_amenity_id=wifi.id))
    db.add(LocationAmenity(location_id=active_loc.id, organization_amenity_id=coffee.id))

    public_space = Space(
        location_id=active_loc.id,
        tenant_id=org.id,
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
        amenities="legacy text",
    )
    private_space = Space(
        location_id=active_loc.id,
        tenant_id=org.id,
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=2,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PRIVATE
    )
    inactive_space = Space(
        location_id=inactive_loc.id,
        tenant_id=org.id,
        space_type=SpaceType.SHARED_DESK,
        capacity=1,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC
    )
    db.add(public_space)
    db.add(private_space)
    db.add(inactive_space)
    db.commit()
    db.refresh(public_space)
    return public_space


def _seed_public_location_marketplace(db):
    owner = User(
        email="owner-public@example.com",
        auth_subject="sub-owner-public",
        full_name="Denis Khakovsky",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Public Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
        )
    )
    admin = User(
        email="admin-public@example.com",
        auth_subject="sub-admin-public",
        first_name="Brian",
        last_name="Mina",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=admin.id,
            role=UserRole.ADMIN,
            can_override_pricing=False,
        )
    )

    coworking_location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Brickell Commons",
        address="200 Brickell Ave",
        city="Miami",
        state="FL",
        postal_code="33131",
        neighborhood="Brickell",
        timezone="America/New_York",
        lat=25.7616,
        lng=-80.1918,
        status=LocationStatus.ACTIVE,
    )
    meeting_location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Harbor Rooms",
        address="615 Channelside Dr",
        city="Tampa",
        state="FL",
        postal_code="33602",
        neighborhood="Channelside",
        timezone="America/New_York",
        lat=27.9506,
        lng=-82.4572,
        public_phone="(954) 906-7565",
        public_email="hello@harborrooms.test",
        public_hours_weekdays="Monday - Friday • 9:00 AM to 5:00 PM",
        public_hours_weekends="Saturday - Sunday • Closed",
        public_parking_notes="Onsite parking in covered garage\n01 & 101 Bus @ SE 3 Ave",
        public_transit_notes="11 Bus @ Las Olas Blvd & SE 4 Ave\nBrightline Fort Lauderdale Station",
        public_included_items="Wellness Room\nFast, Secure Wi-Fi\nDedicated On-Site Staff",
        status=LocationStatus.ACTIVE,
    )
    no_geo_location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="No Geo Hub",
        address="100 Hidden Way",
        city="Miami",
        state="FL",
        postal_code="33132",
        neighborhood="Downtown",
        timezone="America/New_York",
        lat=None,
        lng=None,
        status=LocationStatus.ACTIVE,
    )
    db.add_all([coworking_location, meeting_location, no_geo_location])
    db.commit()
    db.refresh(coworking_location)
    db.refresh(meeting_location)
    db.refresh(no_geo_location)

    wifi = OrganizationAmenity(organization_id=org.id, name="WiFi", slug="wifi")
    coffee = OrganizationAmenity(organization_id=org.id, name="Coffee", slug="coffee")
    db.add_all([wifi, coffee])
    db.commit()
    db.refresh(wifi)
    db.refresh(coffee)
    db.add_all(
        [
            LocationAmenity(location_id=coworking_location.id, organization_amenity_id=wifi.id),
            LocationAmenity(location_id=coworking_location.id, organization_amenity_id=coffee.id),
            LocationAmenity(location_id=meeting_location.id, organization_amenity_id=wifi.id),
        ]
    )

    shared_desk_primary = Space(
        location_id=coworking_location.id,
        tenant_id=org.id,
        name="Open Desk A1",
        space_type=SpaceType.SHARED_DESK,
        capacity=1,
        price_daily=79,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
        amenities="Day pass, Lounge",
    )
    shared_desk_secondary = Space(
        location_id=coworking_location.id,
        tenant_id=org.id,
        name="Open Desk B4",
        space_type=SpaceType.SHARED_DESK,
        capacity=3,
        price_daily=69,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
        amenities="Desk, Coffee",
    )
    private_office = Space(
        location_id=coworking_location.id,
        tenant_id=org.id,
        name="Private Office 501",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=5,
        price_monthly=1800,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    virtual_office = Space(
        location_id=coworking_location.id,
        tenant_id=org.id,
        name="Virtual Office Flex",
        space_type=SpaceType.VIRTUAL_OFFICE,
        capacity=1,
        price_monthly=199,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    meeting_room = Space(
        location_id=meeting_location.id,
        tenant_id=org.id,
        name="Conference 14-B",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        price_daily=220,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0, 0),
        availability_end_time=time(18, 0, 0),
        visibility=SpaceVisibility.PUBLIC,
    )
    no_geo_shared_desk = Space(
        location_id=no_geo_location.id,
        tenant_id=org.id,
        name="Hidden Desk",
        space_type=SpaceType.SHARED_DESK,
        capacity=2,
        price_daily=55,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    no_geo_private_office = Space(
        location_id=no_geo_location.id,
        tenant_id=org.id,
        name="Downtown Private Office",
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=3,
        price_monthly=2100,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    db.add_all(
        [
            shared_desk_primary,
            shared_desk_secondary,
            private_office,
            virtual_office,
            meeting_room,
            no_geo_shared_desk,
            no_geo_private_office,
        ]
    )
    db.commit()
    db.refresh(shared_desk_primary)
    db.refresh(shared_desk_secondary)
    db.refresh(private_office)
    db.refresh(meeting_room)
    db.refresh(no_geo_private_office)

    db.add(
        SpaceImage(
            tenant_id=org.id,
            space_id=shared_desk_secondary.id,
            image_url="https://images.example.com/brickell.jpg",
            storage_key="spaces/brickell.jpg",
            is_primary=True,
            sort_order=0,
        )
    )
    db.add_all(
        [
            SpaceImage(
                tenant_id=org.id,
                space_id=meeting_room.id,
                image_url="https://images.example.com/conference-primary.jpg",
                storage_key="spaces/conference-primary.jpg",
                is_primary=True,
                sort_order=0,
            ),
            SpaceImage(
                tenant_id=org.id,
                space_id=meeting_room.id,
                image_url="https://images.example.com/conference-secondary.jpg",
                storage_key="spaces/conference-secondary.jpg",
                is_primary=False,
                sort_order=1,
            ),
        ]
    )
    db.add(
        PricingRule(
            tenant_id=org.id,
            space_id=meeting_room.id,
            rate_type="hourly",
            rate_amount=60,
        )
    )
    db.add(
        SubscriptionPlan(
            organization_id=org.id,
            tenant_id=org.id,
            name="Open Desk Membership",
            space_type=SpaceType.SHARED_DESK,
            billing_cycle=BillingCycle.MONTHLY,
            price=299,
            is_active=True,
        )
    )
    db.add(
        CancellationPolicy(
            tenant_id=org.id,
            space_type=SpaceType.CONFERENCE_ROOM.value,
            cancel_window_hours=24,
            refund_percent=100,
        )
    )
    db.commit()

    return {
        "coworking_location": coworking_location,
        "meeting_location": meeting_location,
        "no_geo_location": no_geo_location,
        "shared_desk_primary": shared_desk_primary,
        "shared_desk_secondary": shared_desk_secondary,
        "private_office": private_office,
        "no_geo_private_office": no_geo_private_office,
        "meeting_room": meeting_room,
    }


def test_marketplace_filters_visibility_and_active_location(db_session, client_factory):
    public_space = _seed_spaces(db_session)
    client = client_factory({"sub": "sub-owner", "email": "owner@example.com", "email_verified": True})

    resp = client.get("/api/marketplace/search")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["space_public_id"] == public_space.public_id
    assert data[0]["amenities"] == "Coffee, WiFi"

    amenity_search = client.get("/api/marketplace/search?q=coffee")
    assert amenity_search.status_code == 200
    assert len(amenity_search.json()) == 1


def test_public_space_detail_and_media_are_accessible_without_login(db_session):
    public_space = _seed_spaces(db_session)
    image = SpaceImage(
        tenant_id=public_space.tenant_id,
        space_id=public_space.id,
        image_url="https://cdn.example.com/public-space.jpg",
        storage_key="spaces/public-space.jpg",
        is_primary=True,
        sort_order=0,
    )
    db_session.add(image)
    db_session.commit()

    private_space = (
        db_session.query(Space)
        .filter(Space.visibility == SpaceVisibility.PRIVATE)
        .first()
    )

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    try:
        detail = client.get(f"/api/spaces/{public_space.public_id}")
        assert detail.status_code == 200
        assert detail.json()["public_id"] == public_space.public_id
        assert detail.json()["name"] == "Conference Room"
        assert detail.json()["amenities"] == "Coffee, WiFi"

        media = client.get(f"/api/spaces/{public_space.public_id}/media")
        assert media.status_code == 200
        assert len(media.json()) == 1
        assert media.json()[0]["image_url"] == "https://cdn.example.com/public-space.jpg"

        hidden = client.get(f"/api/spaces/{private_space.public_id}")
        assert hidden.status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_public_location_search_aggregates_locations_and_filters_inventory(db_session, client_factory):
    seeded = _seed_public_location_marketplace(db_session)
    client = client_factory({"sub": "sub-owner-public", "email": "owner-public@example.com", "email_verified": True})

    response = client.get("/api/marketplace/locations?category=coworking&q=brickell&amenities=wifi")
    assert response.status_code == 200
    payload = response.json()

    assert payload["meta"]["total_locations"] == 1
    assert len(payload["results"]) == 1

    location = payload["results"][0]
    assert location["location_public_id"] == seeded["coworking_location"].public_id
    assert location["matching_space_count"] == 2
    assert location["starting_day_pass_price"] == 69
    assert location["starting_membership_price"] == 299
    assert location["starting_monthly_price"] is None
    assert location["featured_image_url"] == "https://images.example.com/brickell.jpg"
    assert location["location_amenities"] == ["Coffee", "WiFi"]
    assert location["state"] == "FL"
    assert location["neighborhood"] == "Brickell"


def test_public_location_search_derives_private_office_pricing(db_session, client_factory):
    seeded = _seed_public_location_marketplace(db_session)
    client = client_factory({"sub": "sub-owner-public", "email": "owner-public@example.com", "email_verified": True})

    response = client.get("/api/marketplace/locations?category=private_office&max_price=1900")
    assert response.status_code == 200
    payload = response.json()

    assert payload["meta"]["total_locations"] == 1
    assert payload["results"][0]["location_public_id"] == seeded["coworking_location"].public_id
    assert payload["results"][0]["starting_monthly_price"] == 1800

    capped = client.get("/api/marketplace/locations?category=private_office&max_price=1700")
    assert capped.status_code == 200
    assert capped.json()["meta"]["total_locations"] == 0


def test_public_location_search_includes_locations_without_coordinates(db_session, client_factory):
    seeded = _seed_public_location_marketplace(db_session)
    client = client_factory({"sub": "sub-owner-public", "email": "owner-public@example.com", "email_verified": True})

    response = client.get("/api/marketplace/locations?category=private_office&q=downtown")
    assert response.status_code == 200
    payload = response.json()

    assert payload["meta"]["total_locations"] == 1
    assert payload["results"][0]["location_public_id"] == seeded["no_geo_location"].public_id
    assert payload["results"][0]["lat"] is None
    assert payload["results"][0]["lng"] is None
    assert payload["results"][0]["starting_monthly_price"] == 2100


def test_public_location_detail_supports_meeting_room_filters_and_time_validation(db_session, client_factory):
    seeded = _seed_public_location_marketplace(db_session)
    client = client_factory({"sub": "sub-owner-public", "email": "owner-public@example.com", "email_verified": True})

    missing_end = client.get("/api/marketplace/locations?category=meeting_room&start_time=10:00")
    assert missing_end.status_code == 400

    invalid_window = client.get("/api/marketplace/locations?category=meeting_room&start_time=12:00&end_time=11:00")
    assert invalid_window.status_code == 400

    detail = client.get(
        f"/api/marketplace/locations/{seeded['meeting_location'].public_id}"
        "?category=meeting_room&date=2026-04-15&start_time=10:00&end_time=11:00"
    )
    assert detail.status_code == 200
    body = detail.json()
    assert body["location_public_id"] == seeded["meeting_location"].public_id
    assert body["matching_space_count"] == 1
    assert len(body["spaces"]) == 1
    assert body["spaces"][0]["public_id"] == seeded["meeting_room"].public_id
    assert body["spaces"][0]["name"] == "Conference 14-B"
    assert body["spaces"][0]["hourly_price"] == 60
    assert body["spaces"][0]["availability_start_time"] == "09:00:00"

    outside_hours = client.get(
        f"/api/marketplace/locations/{seeded['meeting_location'].public_id}"
        "?category=meeting_room&start_time=07:00&end_time=08:00"
    )
    assert outside_hours.status_code == 404


def test_public_marketplace_space_detail_returns_listing_content(db_session, client_factory):
    seeded = _seed_public_location_marketplace(db_session)
    client = client_factory({"sub": "sub-owner-public", "email": "owner-public@example.com", "email_verified": True})

    response = client.get(f"/api/marketplace/spaces/{seeded['meeting_room'].public_id}")
    assert response.status_code == 200
    body = response.json()

    assert body["space"]["public_id"] == seeded["meeting_room"].public_id
    assert body["space"]["name"] == "Conference 14-B"
    assert body["space"]["hourly_price"] == 60
    assert body["images"][0]["image_url"] == "https://images.example.com/conference-primary.jpg"
    assert body["images"][1]["image_url"] == "https://images.example.com/conference-secondary.jpg"
    assert body["location"]["public_phone"] == "(954) 906-7565"
    assert body["location"]["public_email"] == "hello@harborrooms.test"
    assert body["location"]["public_parking_notes"] == [
        "Onsite parking in covered garage",
        "01 & 101 Bus @ SE 3 Ave",
    ]
    assert body["location"]["public_transit_notes"] == [
        "11 Bus @ Las Olas Blvd & SE 4 Ave",
        "Brightline Fort Lauderdale Station",
    ]
    assert body["location"]["public_included_items"] == [
        "Wellness Room",
        "Fast, Secure Wi-Fi",
        "Dedicated On-Site Staff",
    ]
    assert body["cancellation_policy"] == {"cancel_window_hours": 24, "refund_percent": 100}
    assert body["support_contacts"] == [
        {"name": "Denis Khakovsky", "title": "Owner"},
        {"name": "Brian Mina", "title": "Admin"},
    ]


def test_public_marketplace_space_detail_hides_private_inventory(db_session):
    public_space = _seed_spaces(db_session)
    private_space = (
        db_session.query(Space)
        .filter(Space.visibility == SpaceVisibility.PRIVATE)
        .first()
    )

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    try:
        visible = client.get(f"/api/marketplace/spaces/{public_space.public_id}")
        assert visible.status_code == 200

        hidden = client.get(f"/api/marketplace/spaces/{private_space.public_id}")
        assert hidden.status_code == 404
    finally:
        app.dependency_overrides.clear()
