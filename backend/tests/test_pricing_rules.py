"""Tests for the consolidated pricing-rule helpers (app/services/pricing_rules.py).

Phase 1 of the production-readiness work removed copy-pasted versions of these
helpers from booking_requests, payments, booking_payments, owner_created_bookings,
and loyalty. The structural test below locks that consolidation shut: if a future
change reintroduces a divergent local copy, the shared-implementation assertions
fail — which is what previously risked guest vs owner-created price drift.
"""

from datetime import datetime, time, timedelta, timezone

from app.models.enums import (
    AvailabilityStatus,
    BookingGranularity,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.pricing_rule import PricingRule
from app.models.space import Space
from app.models.space_volume_discount import SpaceVolumeDiscount
from app.models.user import User
from app.services import pricing_rules
from app.services.pricing import VolumeDiscount


# --- pure unit tests (no DB) -------------------------------------------------

def test_granularity_to_minutes_known_values():
    assert pricing_rules.granularity_to_minutes("30m") == 30
    assert pricing_rules.granularity_to_minutes("60m") == 60
    assert pricing_rules.granularity_to_minutes("120m") == 120
    assert pricing_rules.granularity_to_minutes("daily") == 24 * 60


def test_granularity_to_minutes_defaults_to_60():
    assert pricing_rules.granularity_to_minutes("unrecognized") == 60
    assert pricing_rules.granularity_to_minutes(None) == 60


def test_granularity_to_minutes_unwraps_enum_value():
    # Accepts the BookingGranularity enum directly (uses its .value).
    assert pricing_rules.granularity_to_minutes(BookingGranularity.MIN_120) == 120
    assert pricing_rules.granularity_to_minutes(BookingGranularity.DAILY) == 24 * 60


# --- structural regression lock ----------------------------------------------

def test_all_consumers_share_one_pricing_rule_implementation():
    """Every former duplicate site must reference the single shared helper."""
    import app.api.payments as payments
    import app.services.booking_payments as booking_payments
    import app.services.booking_request_views as booking_request_views
    import app.services.loyalty as loyalty
    import app.services.owner_created_bookings as owner_created_bookings

    get_rule = pricing_rules.get_active_pricing_rule
    volume = pricing_rules.active_volume_discounts
    granularity = pricing_rules.granularity_to_minutes

    # The booking-requests serializer moved to booking_request_views (B1), so the
    # pricing-rule lookups it uses now live there rather than in api/booking_requests.
    assert booking_request_views.get_active_pricing_rule is get_rule
    assert payments.get_active_pricing_rule is get_rule
    assert loyalty.get_active_pricing_rule is get_rule

    assert booking_request_views.active_volume_discounts is volume
    assert booking_payments.active_volume_discounts is volume
    assert owner_created_bookings.active_volume_discounts is volume
    assert loyalty.active_volume_discounts is volume

    assert booking_request_views.granularity_to_minutes is granularity
    assert booking_payments.granularity_to_minutes is granularity
    assert owner_created_bookings.granularity_to_minutes is granularity
    assert loyalty.granularity_to_minutes is granularity


# --- DB-backed behaviour tests -----------------------------------------------

def _seed_space(db_session) -> Space:
    owner = User(
        email="pricing-rules-owner@example.com",
        auth_subject="sub-pricing-rules-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    org = Organization(
        name="Pricing Rules Org",
        owner_id=owner.id,
        review_status=OrganizationReviewStatus.APPROVED,
    )
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
        address="123 Main",
        timezone="UTC",
        status=LocationStatus.ACTIVE,
        booking_granularity=BookingGranularity.MIN_60,
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Conference",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        price_daily=350,
        price_hourly=40,
        availability_status=AvailabilityStatus.AVAILABLE,
        availability_start_time=time(9, 0),
        availability_end_time=time(18, 30),
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)
    return space


def test_active_volume_discounts_returns_only_active_tiers(db_session):
    space = _seed_space(db_session)
    db_session.add_all([
        SpaceVolumeDiscount(
            organization_id=space.tenant_id,
            tenant_id=space.tenant_id,
            space_id=space.id,
            min_hours=4,
            discount_percent=10,
            is_active=True,
        ),
        SpaceVolumeDiscount(
            organization_id=space.tenant_id,
            tenant_id=space.tenant_id,
            space_id=space.id,
            min_hours=8,
            discount_percent=20,
            is_active=False,
        ),
    ])
    db_session.commit()

    discounts = pricing_rules.active_volume_discounts(db_session, space.id)

    assert len(discounts) == 1
    assert isinstance(discounts[0], VolumeDiscount)
    assert discounts[0].min_hours == 4.0
    assert discounts[0].discount_percent == 10


def test_active_volume_discounts_empty_when_none(db_session):
    space = _seed_space(db_session)
    assert pricing_rules.active_volume_discounts(db_session, space.id) == []


def test_get_active_pricing_rule_ignores_expired_and_future(db_session):
    space = _seed_space(db_session)
    now = datetime.now(timezone.utc)
    db_session.add_all([
        PricingRule(
            tenant_id=space.tenant_id,
            space_id=space.id,
            rate_type="hourly",
            rate_amount=50,
            active_from=now - timedelta(days=10),
            active_to=now - timedelta(days=1),  # expired
        ),
        PricingRule(
            tenant_id=space.tenant_id,
            space_id=space.id,
            rate_type="hourly",
            rate_amount=70,
            active_from=now + timedelta(days=1),  # future
            active_to=None,
        ),
        PricingRule(
            tenant_id=space.tenant_id,
            space_id=space.id,
            rate_type="hourly",
            rate_amount=60,
            active_from=now - timedelta(days=1),  # active now
            active_to=None,
        ),
    ])
    db_session.commit()

    rule = pricing_rules.get_active_pricing_rule(db_session, space.id)

    assert rule is not None
    assert rule.rate_amount == 60


def test_get_active_pricing_rule_none_when_no_rules(db_session):
    space = _seed_space(db_session)
    assert pricing_rules.get_active_pricing_rule(db_session, space.id) is None
