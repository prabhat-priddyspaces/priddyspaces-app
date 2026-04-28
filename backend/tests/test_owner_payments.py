from app.models.customer_owner_payment_method import CustomerOwnerPaymentMethod
from app.models.enums import AvailabilityStatus, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.user import User


def _user(db, email: str, sub: str, role: UserAppRole) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _owner_space(db):
    owner = _user(db, "owner-pay@example.com", "sub-owner-pay", UserAppRole.OWNER)
    org = Organization(name="Pay Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True,
    ))
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Main",
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
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        price_daily=200,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, space


def test_owner_payment_settings_and_customer_method_scope(db_session, client_factory):
    owner, org, space = _owner_space(db_session)
    customer = _user(db_session, "pay-cust@example.com", "sub-pay-cust", UserAppRole.CUSTOMER)

    owner_client = client_factory({
        "sub": owner.auth_subject,
        "email": owner.email,
        "email_verified": True,
    })
    saved = owner_client.post(
        f"/api/owner/payment-settings?organization_public_id={org.public_id}",
        json={
            "provider": "cardpointe",
            "is_enabled": True,
            "is_test_mode": True,
            "cardpointe_merchant_id": "merchant_123",
            "cardpointe_username": "api-user",
            "cardpointe_password": "api-pass",
            "cardpointe_site": "https://cardpointe.test",
            "cardpointe_tokenizer_url": "https://tokenizer.test",
        },
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["has_cardpointe_username"] is True
    assert body["has_cardpointe_password"] is True
    assert "api-pass" not in saved.text

    owner_client.patch(
        f"/api/owner/payment-provider/organization/{org.public_id}",
        json={"payment_provider": "cardpointe"},
    )

    customer_client = client_factory({
        "sub": customer.auth_subject,
        "email": customer.email,
        "email_verified": True,
    })
    resolved = customer_client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")
    assert resolved.status_code == 200
    assert resolved.json()["is_configured"] is True
    assert resolved.json()["has_payment_method"] is False

    setup = customer_client.post("/api/payment-methods/setup-session", json={"space_public_id": space.public_id})
    assert setup.status_code == 200
    assert setup.json()["tokenizer_url"] == "https://tokenizer.test"

    method = customer_client.post(
        "/api/payment-methods",
        json={
            "space_public_id": space.public_id,
            "owner_payment_setting_public_id": setup.json()["owner_payment_setting_public_id"],
            "card_token": "token_abc_4242",
            "last4": "4242",
            "brand": "visa",
            "exp_month": 12,
            "exp_year": 2030,
        },
    )
    assert method.status_code == 200
    assert method.json()["last4"] == "4242"
    assert db_session.query(CustomerOwnerPaymentMethod).count() == 1

    resolved = customer_client.get(f"/api/payment-methods/resolve?space_public_id={space.public_id}")
    assert resolved.json()["has_payment_method"] is True
    assert resolved.json()["payment_method_public_id"] == method.json()["public_id"]
