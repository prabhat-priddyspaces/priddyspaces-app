from datetime import date
from types import SimpleNamespace

import app.api.payments as payments_api
import app.api.subscriptions as subscriptions_api
from app.models.enums import AvailabilityStatus, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.subscription import Subscription
from app.models.user import User


def _create_user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _seed_tenant(db, owner: User, name: str):
    org = Organization(name=name, owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    )
    db.add(member)

    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=f"{name} HQ",
        address="123 Main",
        city="Testville",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        space_type=SpaceType.PRIVATE_OFFICE,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_monthly=1500,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return org, location, space


def test_subscription_list_and_cancel(db_session, client_factory, monkeypatch):
    owner = _create_user(db_session, "owner@example.com", "sub-owner", UserAppRole.OWNER)
    customer = _create_user(db_session, "customer@example.com", "sub-customer", UserAppRole.CUSTOMER)
    org, _location, space = _seed_tenant(db_session, owner, "OrgOne")

    subscription = Subscription(
        user_id=customer.id,
        space_id=space.id,
        tenant_id=org.id,
        status="active",
        start_date=date(2026, 2, 1),
        end_date=None,
        stripe_subscription_id="sub_test_123",
    )
    db_session.add(subscription)
    db_session.commit()
    db_session.refresh(subscription)

    owner_client = client_factory(
        {"sub": owner.auth_subject, "email": owner.email, "email_verified": True}
    )
    owner_list = owner_client.get("/api/subscriptions")
    assert owner_list.status_code == 200
    owner_data = owner_list.json()
    assert len(owner_data) == 1
    assert owner_data[0]["public_id"] == subscription.public_id
    assert owner_data[0]["space_public_id"] == space.public_id
    assert owner_data[0]["location_name"] == "OrgOne HQ"

    customer_client = client_factory(
        {"sub": customer.auth_subject, "email": customer.email, "email_verified": True}
    )

    canceled_ids: list[str] = []

    def fake_cancel(subscription_id: str):
        canceled_ids.append(subscription_id)
        return SimpleNamespace(id=subscription_id, cancel_at_period_end=True)

    monkeypatch.setattr(subscriptions_api, "cancel_stripe_subscription", fake_cancel)

    resp = customer_client.post(f"/api/subscriptions/{subscription.public_id}/cancel")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["status"] == "canceling"
    assert canceled_ids == ["sub_test_123"]

    db_session.refresh(subscription)
    assert subscription.status == "canceling"


def test_customer_portal_session_created(db_session, client_factory, monkeypatch):
    customer = _create_user(db_session, "customer@example.com", "sub-customer", UserAppRole.CUSTOMER)

    created_customers: list[str] = []
    created_portal_sessions: list[tuple[str, str]] = []

    def fake_create_customer(email: str):
        created_customers.append(email)
        return SimpleNamespace(id="cus_test_123")

    def fake_create_portal(customer_id: str, return_url: str):
        created_portal_sessions.append((customer_id, return_url))
        return SimpleNamespace(url="https://billing.example.test/session")

    monkeypatch.setattr(payments_api, "create_customer", fake_create_customer)
    monkeypatch.setattr(payments_api, "create_billing_portal_session", fake_create_portal)

    client = client_factory(
        {"sub": customer.auth_subject, "email": customer.email, "email_verified": True}
    )
    resp = client.post("/api/payments/customer-portal")

    assert resp.status_code == 200
    assert resp.json()["url"] == "https://billing.example.test/session"
    assert created_customers == [customer.email]
    assert created_portal_sessions
    assert created_portal_sessions[0][0] == "cus_test_123"
    assert created_portal_sessions[0][1].endswith("/customer/subscriptions")

    db_session.refresh(customer)
    assert customer.stripe_customer_id == "cus_test_123"
