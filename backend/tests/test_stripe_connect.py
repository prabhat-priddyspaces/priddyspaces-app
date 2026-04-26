from app.models.enums import UserAppRole, UserRole
from app.models.user import User
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember


def test_stripe_connect_onboard(db_session, client_factory, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setattr("app.api.stripe_connect.settings.STRIPE_SECRET_KEY", "sk_test_123")
    monkeypatch.setattr("app.api.stripe_connect.stripe.api_key", "sk_test_123")
    owner = User(
        email="owner@example.com",
        auth_subject="sub-owner",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True
    )
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)

    org = Organization(name="Owner Org", owner_id=owner.id)
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    member = OrganizationMember(
        organization_id=org.id,
        tenant_id=org.id,
        user_id=owner.id,
        role=UserRole.OWNER,
        can_override_pricing=True
    )
    db_session.add(member)
    db_session.commit()

    class FakeAccount:
        id = "acct_test_123"

    class FakeLink:
        url = "https://stripe.test/onboard"

    monkeypatch.setattr("app.api.stripe_connect.stripe.Account.create", lambda **kwargs: FakeAccount())
    monkeypatch.setattr("app.api.stripe_connect.stripe.AccountLink.create", lambda **kwargs: FakeLink())

    client = client_factory({
        "sub": "sub-owner",
        "email": owner.email,
        "email_verified": True
    })

    res = client.post(f"/api/stripe/connect/onboard?organization_public_id={org.public_id}")
    assert res.status_code == 200
    assert res.json()["url"] == "https://stripe.test/onboard"

    status = client.get(f"/api/stripe/connect/status?organization_public_id={org.public_id}")
    assert status.status_code == 200
    assert status.json()["connected"] is True
