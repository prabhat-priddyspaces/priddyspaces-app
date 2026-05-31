from datetime import datetime, timezone

from app.models.enums import (
    AvailabilityStatus,
    BillingCycle,
    LocationStatus,
    OrganizationReviewStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
)
from app.models.location import Location
from app.models.organization import Organization
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User


def _seed_member(db):
    member = User(
        email="subscription-member@example.com",
        auth_subject="subscription-member",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def _seed_subscription_space(
    db,
    *,
    suffix="",
    review_status=OrganizationReviewStatus.APPROVED,
    location_status=LocationStatus.ACTIVE,
    availability_status=AvailabilityStatus.AVAILABLE,
    visibility=SpaceVisibility.PUBLIC,
):
    suffix_part = f"-{suffix}" if suffix else ""
    owner = User(
        email=f"subscription-owner{suffix_part}@example.com",
        auth_subject=f"subscription-owner{suffix_part}",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(
        name=f"Subscription Org{suffix_part}",
        owner_id=owner.id,
        review_status=review_status,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Subscription HQ",
        address="123 Main",
        city="Testville",
        timezone="UTC",
        status=location_status,
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Monthly Desk",
        space_type=SpaceType.SHARED_DESK,
        capacity=4,
        availability_status=availability_status,
        visibility=visibility,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return org, location, space


def _seed_subscription_plan(
    db,
    org: Organization,
    space: Space,
    *,
    stripe_price_id="price_public",
    is_active=True,
):
    plan = SubscriptionPlan(
        organization_id=org.id,
        tenant_id=org.id,
        name="Monthly Desk",
        space_type=space.space_type,
        billing_cycle=BillingCycle.MONTHLY,
        price=199,
        stripe_price_id=stripe_price_id,
        is_active=is_active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _member_client(client_factory):
    return client_factory(
        {
            "sub": "subscription-member",
            "email": "subscription-member@example.com",
            "email_verified": True,
        }
    )


class _StripeCustomer:
    id = "cus_subscription_member"


class _StripeSubscription(dict):
    id = "sub_subscription_1"
    current_period_start = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp())


def test_subscription_purchase_creates_pending_subscription_for_public_space(
    db_session, client_factory, monkeypatch
):
    member = _seed_member(db_session)
    org, _location, space = _seed_subscription_space(db_session)
    plan = _seed_subscription_plan(db_session, org, space)
    created = {}

    monkeypatch.setattr("app.api.payments.create_customer", lambda email: _StripeCustomer())

    def fake_create_subscription(customer_id, stripe_price_id, metadata):
        created["customer_id"] = customer_id
        created["stripe_price_id"] = stripe_price_id
        created["metadata"] = metadata
        return _StripeSubscription()

    monkeypatch.setattr("app.api.payments.create_subscription", fake_create_subscription)

    resp = _member_client(client_factory).post(
        "/api/payments/subscription",
        json={
            "space_public_id": space.public_id,
            "subscription_plan_public_id": plan.public_id,
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["stripe_subscription_id"] == "sub_subscription_1"
    assert created["customer_id"] == "cus_subscription_member"
    assert created["stripe_price_id"] == "price_public"
    assert created["metadata"]["space_public_id"] == space.public_id
    subscription = (
        db_session.query(Subscription).filter(Subscription.user_id == member.id).first()
    )
    assert subscription is not None
    assert subscription.space_id == space.id
    assert subscription.status == "pending"


def test_subscription_purchase_allows_legacy_price_id_when_active_plan_matches(
    db_session, client_factory, monkeypatch
):
    _seed_member(db_session)
    org, _location, space = _seed_subscription_space(db_session)
    _seed_subscription_plan(db_session, org, space, stripe_price_id="price_legacy")
    created = {}

    monkeypatch.setattr("app.api.payments.create_customer", lambda email: _StripeCustomer())

    def fake_create_subscription(customer_id, stripe_price_id, metadata):
        created["stripe_price_id"] = stripe_price_id
        return _StripeSubscription()

    monkeypatch.setattr("app.api.payments.create_subscription", fake_create_subscription)

    resp = _member_client(client_factory).post(
        "/api/payments/subscription",
        json={"space_public_id": space.public_id, "stripe_price_id": "price_legacy"},
    )

    assert resp.status_code == 200, resp.text
    assert created["stripe_price_id"] == "price_legacy"


def test_subscription_purchase_rejects_unconfigured_stripe_price_id(
    db_session, client_factory, monkeypatch
):
    _seed_member(db_session)
    org, _location, space = _seed_subscription_space(db_session)
    _seed_subscription_plan(db_session, org, space, stripe_price_id="price_configured")
    created = {"called": False}

    def fail_create_subscription(*_args, **_kwargs):
        created["called"] = True
        raise AssertionError("Stripe subscription should not be created")

    monkeypatch.setattr("app.api.payments.create_subscription", fail_create_subscription)

    resp = _member_client(client_factory).post(
        "/api/payments/subscription",
        json={"space_public_id": space.public_id, "stripe_price_id": "price_attacker"},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Subscription plan not found"
    assert created["called"] is False


def test_subscription_purchase_rejects_non_public_spaces(
    db_session, client_factory, monkeypatch
):
    _seed_member(db_session)
    cases = (
        {"review_status": OrganizationReviewStatus.PENDING},
        {"location_status": LocationStatus.INACTIVE},
        {"visibility": SpaceVisibility.PRIVATE},
    )
    created = {"called": False}

    def fail_create_subscription(*_args, **_kwargs):
        created["called"] = True
        raise AssertionError("Stripe subscription should not be created")

    monkeypatch.setattr("app.api.payments.create_subscription", fail_create_subscription)

    for index, case in enumerate(cases):
        _org, _location, space = _seed_subscription_space(
            db_session, suffix=str(index), **case
        )

        resp = _member_client(client_factory).post(
            "/api/payments/subscription",
            json={
                "space_public_id": space.public_id,
                "stripe_price_id": f"price_blocked_{index}",
            },
        )

        assert resp.status_code == 404
        assert resp.json()["detail"] == "Space not found"

    assert created["called"] is False


def test_subscription_purchase_rejects_unavailable_space(
    db_session, client_factory, monkeypatch
):
    _seed_member(db_session)
    _org, _location, space = _seed_subscription_space(
        db_session,
        availability_status=AvailabilityStatus.MAINTENANCE,
    )
    created = {"called": False}

    def fail_create_subscription(*_args, **_kwargs):
        created["called"] = True
        raise AssertionError("Stripe subscription should not be created")

    monkeypatch.setattr("app.api.payments.create_subscription", fail_create_subscription)

    resp = _member_client(client_factory).post(
        "/api/payments/subscription",
        json={"space_public_id": space.public_id, "stripe_price_id": "price_unavailable"},
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Space not available"
    assert created["called"] is False
