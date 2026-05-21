from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.password import hash_password
from app.db.session import SessionLocal
from app.models.enums import (
    AvailabilityStatus,
    BookingMode,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.location_amenity import LocationAmenity
from app.models.organization import Organization
from app.models.organization_amenity import OrganizationAmenity
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.space_booking_mode import SpaceBookingMode
from app.models.space_image import SpaceImage
from app.models.user import User
from app.services.amenities import seed_default_amenities


DEMO_OWNER_PASSWORD_ENV = "DEMO_OWNER_PASSWORD"

DEMO_ORGS: list[dict[str, Any]] = [
    # ─── New York ───────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.nyc@priddyspaces.demo",
            "first_name": "Ava",
            "last_name": "Miller",
        },
        "organization": {
            "name": "Skyline Works NYC",
            "branding": "Premium coworking in Manhattan for startups and hybrid teams.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": 12,
        },
        "locations": [
            {
                "name": "Nomad Hub",
                "address": "115 W 30th St",
                "city": "New York",
                "state": "NY",
                "postal_code": "10001",
                "neighborhood": "NoMad",
                "timezone": "America/New_York",
                "lat": 40.7484,
                "lng": -73.9889,
                "amenities": ["WiFi", "Coffee", "Printer", "Whiteboard"],
                "spaces": [
                    {
                        "name": "Open Desk A1",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 45,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Hudson Boardroom",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 55,
                        "price_daily": 380,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Private Office 401",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 2400,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                ],
            },
            {
                "name": "Brooklyn Loft",
                "address": "55 Washington St",
                "city": "Brooklyn",
                "state": "NY",
                "postal_code": "11201",
                "neighborhood": "DUMBO",
                "timezone": "America/New_York",
                "lat": 40.7033,
                "lng": -73.9891,
                "amenities": ["WiFi", "Coffee", "Parking"],
                "spaces": [
                    {
                        "name": "Loft Desk 12",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 39,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Bridge Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 6,
                        "price_hourly": 42,
                        "price_daily": 280,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Brooklyn Virtual Desk",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 89,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
    # ─── Florida ────────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.miami@priddyspaces.demo",
            "first_name": "Leo",
            "last_name": "Garcia",
        },
        "organization": {
            "name": "Harbor Collective Miami",
            "branding": "Sunlit desks and meeting suites near Brickell.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "Brickell Commons",
                "address": "200 Brickell Ave",
                "city": "Miami",
                "state": "FL",
                "postal_code": "33131",
                "neighborhood": "Brickell",
                "timezone": "America/New_York",
                "lat": 25.7616,
                "lng": -80.1918,
                "amenities": ["WiFi", "Coffee", "Parking", "Meeting Room"],
                "spaces": [
                    {
                        "name": "Brickell Day Pass",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 49,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Bayview Suite",
                        "space_type": SpaceType.SUITE,
                        "capacity": 8,
                        "price_monthly": 5200,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                    {
                        "name": "Ocean Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 10,
                        "price_hourly": 65,
                        "price_daily": 420,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                ],
            },
            {
                "name": "Wynwood Creative Hub",
                "address": "2750 NW 3rd Ave",
                "city": "Miami",
                "state": "FL",
                "postal_code": "33127",
                "neighborhood": "Wynwood",
                "timezone": "America/New_York",
                "lat": 25.7998,
                "lng": -80.1990,
                "amenities": ["WiFi", "Coffee", "Art Studio", "Rooftop"],
                "spaces": [
                    {
                        "name": "Wynwood Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 42,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Gallery Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 50,
                        "price_daily": 330,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Artist Private Studio",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 3,
                        "price_monthly": 1800,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                ],
            },
        ],
    },
    # ─── Texas ──────────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.austin@priddyspaces.demo",
            "first_name": "Nina",
            "last_name": "Patel",
        },
        "organization": {
            "name": "Launchpad Labs Austin",
            "branding": "Where Texas startups ship fast.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "South Congress Lab",
                "address": "1401 S Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78704",
                "neighborhood": "South Congress",
                "timezone": "America/Chicago",
                "lat": 30.2493,
                "lng": -97.7495,
                "amenities": ["WiFi", "Coffee", "Whiteboard", "Standing Desks"],
                "spaces": [
                    {
                        "name": "Launch Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 35,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Investor Pitch Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 6,
                        "price_hourly": 40,
                        "price_daily": 240,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Founder Suite",
                        "space_type": SpaceType.SUITE,
                        "capacity": 10,
                        "price_monthly": 4500,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                ],
            },
            {
                "name": "East Austin Tech Den",
                "address": "979 Springdale Rd",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78702",
                "neighborhood": "East Austin",
                "timezone": "America/Chicago",
                "lat": 30.2633,
                "lng": -97.7026,
                "amenities": ["WiFi", "Coffee", "Podcast Studio", "Phone Booths"],
                "spaces": [
                    {
                        "name": "East Side Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 32,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Tech Boardroom",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 12,
                        "price_hourly": 55,
                        "price_daily": 360,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Virtual HQ Austin",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 79,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
    # ─── California ─────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.la@priddyspaces.demo",
            "first_name": "Zoe",
            "last_name": "Chen",
        },
        "organization": {
            "name": "Pacific Hub Los Angeles",
            "branding": "Creative coworking from Venice to DTLA.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": 10,
        },
        "locations": [
            {
                "name": "Venice Beach Studio",
                "address": "1800 Lincoln Blvd",
                "city": "Venice",
                "state": "CA",
                "postal_code": "90291",
                "neighborhood": "Venice Beach",
                "timezone": "America/Los_Angeles",
                "lat": 33.9850,
                "lng": -118.4695,
                "amenities": ["WiFi", "Coffee", "Ocean View", "Bike Storage", "Yoga Room"],
                "spaces": [
                    {
                        "name": "Venice Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 55,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Director's Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 70,
                        "price_daily": 460,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Creative Suite West",
                        "space_type": SpaceType.SUITE,
                        "capacity": 15,
                        "price_monthly": 7500,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                    {
                        "name": "Venice Virtual Address",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 99,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
            {
                "name": "Downtown LA Workspace",
                "address": "811 W 7th St",
                "city": "Los Angeles",
                "state": "CA",
                "postal_code": "90017",
                "neighborhood": "Downtown LA",
                "timezone": "America/Los_Angeles",
                "lat": 34.0483,
                "lng": -118.2590,
                "amenities": ["WiFi", "Coffee", "Rooftop Terrace", "Gym Access", "Parking"],
                "spaces": [
                    {
                        "name": "DTLA Day Pass Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 48,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Wilshire Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 10,
                        "price_hourly": 60,
                        "price_daily": 390,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Executive Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 5,
                        "price_monthly": 3200,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                ],
            },
        ],
    },
    # ─── Illinois ───────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.chicago@priddyspaces.demo",
            "first_name": "Marcus",
            "last_name": "Johnson",
        },
        "organization": {
            "name": "Windy City Works",
            "branding": "Chicago's premier flexible workspace network.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "River North Space",
                "address": "212 W Kinzie St",
                "city": "Chicago",
                "state": "IL",
                "postal_code": "60654",
                "neighborhood": "River North",
                "timezone": "America/Chicago",
                "lat": 41.8888,
                "lng": -87.6355,
                "amenities": ["WiFi", "Coffee", "Lounge", "Bike Storage", "Phone Booths"],
                "spaces": [
                    {
                        "name": "River North Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 38,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Chicago River Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 48,
                        "price_daily": 310,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Kinzie Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 2100,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                ],
            },
            {
                "name": "The Loop HQ",
                "address": "77 W Wacker Dr",
                "city": "Chicago",
                "state": "IL",
                "postal_code": "60601",
                "neighborhood": "The Loop",
                "timezone": "America/Chicago",
                "lat": 41.8876,
                "lng": -87.6367,
                "amenities": ["WiFi", "Coffee", "Concierge", "Parking", "Event Space"],
                "spaces": [
                    {
                        "name": "Loop Day Pass",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 45,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Wacker Boardroom",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 16,
                        "price_hourly": 75,
                        "price_daily": 490,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Chicago Executive Suite",
                        "space_type": SpaceType.SUITE,
                        "capacity": 20,
                        "price_monthly": 9000,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                    {
                        "name": "Loop Virtual Address",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 85,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
    # ─── Washington ─────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.seattle@priddyspaces.demo",
            "first_name": "Sofia",
            "last_name": "Andersen",
        },
        "organization": {
            "name": "Emerald City Collective",
            "branding": "Seattle's home for tech and creative professionals.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "Capitol Hill Hub",
                "address": "1421 10th Ave",
                "city": "Seattle",
                "state": "WA",
                "postal_code": "98122",
                "neighborhood": "Capitol Hill",
                "timezone": "America/Los_Angeles",
                "lat": 47.6161,
                "lng": -122.3147,
                "amenities": ["WiFi", "Coffee", "Rain Garden", "Standing Desks", "Podcast Studio"],
                "spaces": [
                    {
                        "name": "Capitol Hill Day Pass",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 40,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Pike Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 52,
                        "price_daily": 340,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Rainier Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 3,
                        "price_monthly": 1900,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                    {
                        "name": "Seattle Virtual HQ",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 75,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
    # ─── Colorado ───────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.denver@priddyspaces.demo",
            "first_name": "Ethan",
            "last_name": "Brooks",
        },
        "organization": {
            "name": "Mile High Works Denver",
            "branding": "Where the Rockies inspire your best work.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "RiNo Creative Station",
                "address": "2930 Umatilla St",
                "city": "Denver",
                "state": "CO",
                "postal_code": "80211",
                "neighborhood": "River North Art District",
                "timezone": "America/Denver",
                "lat": 39.7706,
                "lng": -105.0142,
                "amenities": ["WiFi", "Coffee", "Bike Storage", "Outdoor Patio", "Beer Tap"],
                "spaces": [
                    {
                        "name": "RiNo Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 33,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Mountain View Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 10,
                        "price_hourly": 45,
                        "price_daily": 295,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Denver Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 1700,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                    {
                        "name": "Summit Suite",
                        "space_type": SpaceType.SUITE,
                        "capacity": 12,
                        "price_monthly": 5800,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                ],
            },
        ],
    },
    # ─── Georgia ────────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.atlanta@priddyspaces.demo",
            "first_name": "Keisha",
            "last_name": "Williams",
        },
        "organization": {
            "name": "Peach State Spaces",
            "branding": "Atlanta's friendliest coworking community.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "Midtown Atlanta Hub",
                "address": "999 Peachtree St NE",
                "city": "Atlanta",
                "state": "GA",
                "postal_code": "30309",
                "neighborhood": "Midtown",
                "timezone": "America/New_York",
                "lat": 33.7866,
                "lng": -84.3831,
                "amenities": ["WiFi", "Coffee", "Lounge", "Rooftop", "Parking"],
                "spaces": [
                    {
                        "name": "Peachtree Day Pass",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 36,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Peach Boardroom",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 12,
                        "price_hourly": 50,
                        "price_daily": 325,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Midtown Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 1950,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                    {
                        "name": "Atlanta Virtual Office",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 69,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
    # ─── Tennessee ──────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.nashville@priddyspaces.demo",
            "first_name": "James",
            "last_name": "Carter",
        },
        "organization": {
            "name": "Music City Works",
            "branding": "Nashville's most creative workspace community.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "The Gulch Workspace",
                "address": "200 Demonbreun St",
                "city": "Nashville",
                "state": "TN",
                "postal_code": "37201",
                "neighborhood": "The Gulch",
                "timezone": "America/Chicago",
                "lat": 36.1525,
                "lng": -86.7866,
                "amenities": ["WiFi", "Coffee", "Recording Studio", "Rooftop", "Parking"],
                "spaces": [
                    {
                        "name": "Nashville Hot Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 34,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Ryman Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 8,
                        "price_hourly": 45,
                        "price_daily": 295,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Country Suite",
                        "space_type": SpaceType.SUITE,
                        "capacity": 10,
                        "price_monthly": 4200,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.SUITE_LEASE],
                    },
                ],
            },
        ],
    },
    # ─── Arizona ────────────────────────────────────────────────────────────────
    {
        "owner": {
            "email": "owner.phoenix@priddyspaces.demo",
            "first_name": "Aria",
            "last_name": "Reyes",
        },
        "organization": {
            "name": "Desert Sun Spaces",
            "branding": "Phoenix coworking under clear blue skies.",
            "review_status": OrganizationReviewStatus.APPROVED,
            "commission_override_pct": None,
        },
        "locations": [
            {
                "name": "Scottsdale Innovation Center",
                "address": "7150 E Camelback Rd",
                "city": "Scottsdale",
                "state": "AZ",
                "postal_code": "85251",
                "neighborhood": "Old Town Scottsdale",
                "timezone": "America/Phoenix",
                "lat": 33.5023,
                "lng": -111.9261,
                "amenities": ["WiFi", "Coffee", "Pool Access", "Parking", "Golf Simulator"],
                "spaces": [
                    {
                        "name": "Sonoran Desk",
                        "space_type": SpaceType.SHARED_DESK,
                        "capacity": 1,
                        "price_daily": 32,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.DAY_PASS, BookingMode.MONTHLY_MEMBERSHIP],
                    },
                    {
                        "name": "Camelback Meeting Room",
                        "space_type": SpaceType.CONFERENCE_ROOM,
                        "capacity": 10,
                        "price_hourly": 44,
                        "price_daily": 290,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.HOURLY],
                    },
                    {
                        "name": "Desert Private Office",
                        "space_type": SpaceType.PRIVATE_OFFICE,
                        "capacity": 4,
                        "price_monthly": 1600,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.PRIVATE_OFFICE_LEASE],
                    },
                    {
                        "name": "Phoenix Virtual Address",
                        "space_type": SpaceType.VIRTUAL_OFFICE,
                        "capacity": 1,
                        "price_monthly": 65,
                        "visibility": SpaceVisibility.PUBLIC,
                        "booking_modes": [BookingMode.VIRTUAL_MEMBERSHIP],
                    },
                ],
            },
        ],
    },
]


def _slug(text: str) -> str:
    return "-".join(text.lower().split())


def _reviewer_user_id(db: Session) -> int | None:
    member = db.query(PlatformTeamMember).filter(PlatformTeamMember.is_active.is_(True)).first()
    return member.user_id if member else None


def _upsert_user(
    db: Session,
    *,
    email: str,
    first_name: str,
    last_name: str,
    password: str,
) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
    user.first_name = first_name
    user.last_name = last_name
    user.full_name = f"{first_name} {last_name}".strip()
    user.role = UserAppRole.OWNER
    user.email_verified = True
    user.is_active = True
    user.password_hash = hash_password(password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _upsert_org(
    db: Session,
    *,
    owner: User,
    name: str,
    branding: str | None,
    review_status: OrganizationReviewStatus,
    commission_override_pct: int | None,
    reviewer_user_id: int | None,
) -> Organization:
    org = db.query(Organization).filter(Organization.owner_id == owner.id, Organization.name == name).first()
    if not org:
        org = Organization(name=name, owner_id=owner.id)
    org.name = name
    org.owner_id = owner.id
    org.branding = branding
    org.review_status = review_status
    org.commission_override_pct = commission_override_pct
    if review_status == OrganizationReviewStatus.APPROVED:
        org.reviewed_by_user_id = reviewer_user_id
        org.reviewed_at = datetime.now(timezone.utc)
        org.review_notes = "Seeded approved demo owner"
    elif review_status == OrganizationReviewStatus.PENDING:
        org.reviewed_by_user_id = None
        org.reviewed_at = None
        org.review_notes = "Seeded pending demo owner for approval queue"
    else:
        org.reviewed_by_user_id = reviewer_user_id
        org.reviewed_at = datetime.now(timezone.utc)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ensure_owner_membership(db: Session, *, org: Organization, owner: User) -> None:
    member = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == owner.id,
        )
        .first()
    )
    if not member:
        member = OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            can_override_pricing=True,
            receives_new_booking_email=True,
            is_active=True,
        )
    else:
        member.tenant_id = org.id
        member.role = UserRole.OWNER
        member.can_override_pricing = True
        member.receives_new_booking_email = True
        member.is_active = True
    db.add(member)
    db.commit()


def _upsert_location(db: Session, *, org: Organization, payload: dict[str, Any]) -> Location:
    location = (
        db.query(Location)
        .filter(Location.organization_id == org.id, Location.name == payload["name"])
        .first()
    )
    if not location:
        location = Location(
            organization_id=org.id,
            tenant_id=org.id,
            name=payload["name"],
            address=payload["address"],
            timezone=payload["timezone"],
        )
    location.organization_id = org.id
    location.tenant_id = org.id
    location.name = payload["name"]
    location.address = payload["address"]
    location.city = payload["city"]
    location.state = payload["state"]
    location.postal_code = payload["postal_code"]
    location.neighborhood = payload["neighborhood"]
    location.timezone = payload["timezone"]
    location.lat = payload["lat"]
    location.lng = payload["lng"]
    location.status = LocationStatus.ACTIVE
    location.public_email = f"hello@{_slug(org.name)}.demo"
    location.public_phone = "(555) 010-2026"
    location.public_hours_weekdays = "Monday - Friday • 8:00 AM to 6:00 PM"
    location.public_hours_weekends = "Saturday • 10:00 AM to 2:00 PM"
    location.public_parking_notes = "Paid garage parking available nearby"
    location.public_transit_notes = "Close to downtown transit stops"
    location.public_included_items = "WiFi\nCoffee\nOnsite support"
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


def _ensure_location_amenities(
    db: Session,
    *,
    org: Organization,
    location: Location,
    amenity_names: list[str],
) -> None:
    seed_default_amenities(db, org.id)
    db.commit()
    amenity_map = {
        amenity.name.lower(): amenity
        for amenity in db.query(OrganizationAmenity)
        .filter(
            OrganizationAmenity.organization_id == org.id,
            OrganizationAmenity.deleted_at.is_(None),
        )
        .all()
    }
    for amenity_name in amenity_names:
        amenity = amenity_map.get(amenity_name.lower())
        if not amenity:
            amenity = OrganizationAmenity(
                organization_id=org.id,
                name=amenity_name,
                slug=_slug(amenity_name),
            )
            db.add(amenity)
            db.commit()
            db.refresh(amenity)
            amenity_map[amenity_name.lower()] = amenity
        link = (
            db.query(LocationAmenity)
            .filter(
                LocationAmenity.location_id == location.id,
                LocationAmenity.organization_amenity_id == amenity.id,
            )
            .first()
        )
        if not link:
            db.add(LocationAmenity(location_id=location.id, organization_amenity_id=amenity.id))
    db.commit()


def _upsert_space(
    db: Session,
    *,
    org: Organization,
    location: Location,
    payload: dict[str, Any],
) -> Space:
    space = db.query(Space).filter(Space.location_id == location.id, Space.name == payload["name"]).first()
    if not space:
        space = Space(
            location_id=location.id,
            tenant_id=org.id,
            name=payload["name"],
            space_type=payload["space_type"],
        )
    space.location_id = location.id
    space.tenant_id = org.id
    space.name = payload["name"]
    space.space_type = payload["space_type"]
    space.capacity = payload["capacity"]
    space.price_hourly = payload.get("price_hourly")
    space.price_daily = payload.get("price_daily")
    space.price_monthly = payload.get("price_monthly")
    space.visibility = payload["visibility"]
    space.availability_status = AvailabilityStatus.AVAILABLE
    space.amenities = "WiFi, Coffee, Community"
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


def _ensure_space_booking_modes(
    db: Session,
    *,
    org: Organization,
    space: Space,
    booking_modes: list[BookingMode],
) -> None:
    for mode in booking_modes:
        exists = (
            db.query(SpaceBookingMode)
            .filter(SpaceBookingMode.space_id == space.id, SpaceBookingMode.booking_mode == mode.value)
            .first()
        )
        if not exists:
            db.add(
                SpaceBookingMode(
                    tenant_id=org.id,
                    space_id=space.id,
                    booking_mode=mode.value,
                    is_enabled=True,
                )
            )
    db.commit()


def _ensure_space_image(db: Session, *, org: Organization, space: Space) -> None:
    image = (
        db.query(SpaceImage)
        .filter(SpaceImage.space_id == space.id, SpaceImage.is_primary.is_(True))
        .first()
    )
    if image:
        return
    slug = _slug(f"{org.name}-{space.name}")
    db.add(
        SpaceImage(
            tenant_id=org.id,
            space_id=space.id,
            image_url=f"https://placehold.co/1200x800/png?text={slug}",
            storage_key=f"seed/{slug}.png",
            is_primary=True,
            sort_order=0,
        )
    )
    db.commit()


def seed_demo_data(db: Session, *, owner_password: str) -> dict[str, int]:
    reviewer_user_id = _reviewer_user_id(db)
    counts: dict[str, int] = {"owners": 0, "organizations": 0, "locations": 0, "spaces": 0}
    for demo_org in DEMO_ORGS:
        owner = _upsert_user(db, password=owner_password, **demo_org["owner"])
        counts["owners"] += 1

        org = _upsert_org(
            db,
            owner=owner,
            reviewer_user_id=reviewer_user_id,
            **demo_org["organization"],
        )
        counts["organizations"] += 1
        _ensure_owner_membership(db, org=org, owner=owner)

        for location_payload in demo_org["locations"]:
            location = _upsert_location(db, org=org, payload=location_payload)
            counts["locations"] += 1
            _ensure_location_amenities(
                db, org=org, location=location, amenity_names=location_payload["amenities"]
            )
            for space_payload in location_payload["spaces"]:
                space = _upsert_space(db, org=org, location=location, payload=space_payload)
                counts["spaces"] += 1
                _ensure_space_booking_modes(
                    db, org=org, space=space, booking_modes=space_payload.get("booking_modes", [])
                )
                if space.visibility == SpaceVisibility.PUBLIC:
                    _ensure_space_image(db, org=org, space=space)
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo owners and listings")
    parser.add_argument(
        "--owner-password",
        default=os.environ.get(DEMO_OWNER_PASSWORD_ENV),
        help=f"Password assigned to all seeded owner accounts; defaults to ${DEMO_OWNER_PASSWORD_ENV}",
    )
    args = parser.parse_args()
    if not args.owner_password:
        raise SystemExit(
            f"Set {DEMO_OWNER_PASSWORD_ENV} or pass --owner-password before seeding demo owners"
        )

    db = SessionLocal()
    try:
        counts = seed_demo_data(db, owner_password=args.owner_password)
    finally:
        db.close()

    print("Seeded demo owners and listings")
    print("Owners:")
    for demo_org in DEMO_ORGS:
        print(f"  - {demo_org['owner']['email']} ({demo_org['organization']['name']})")
    print(
        f"Summary: owners={counts['owners']} organizations={counts['organizations']} "
        f"locations={counts['locations']} spaces={counts['spaces']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
