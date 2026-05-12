from urllib.parse import parse_qs, urlparse

from app.assistant.redaction import redact_pii
from app.core.config import settings
from app.models.assistant import AssistantConversation, AssistantMessage, OwnerPolicyKB
from app.models.enums import AvailabilityStatus, PlatformTeamRole, SpaceType, UserAppRole, UserRole
from app.models.location import Location
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.platform_team_member import PlatformTeamMember
from app.models.space import Space
from app.models.user import User


def _seed_owner_location(db):
    owner = User(
        email="owner-assistant@example.com",
        auth_subject="sub-owner-assistant",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)

    org = Organization(name="Assistant Org", owner_id=owner.id)
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
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Assistant HQ",
        address="100 AI Way",
        city="Miami",
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Focus Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=6,
        price_hourly=40,
        availability_status=AvailabilityStatus.AVAILABLE,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return owner, org, location, space


def test_assistant_disabled_response(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", False)
    client = client_factory({"sub": "missing", "email": "nobody@example.com", "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "hello"})

    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["disabled_reason"] == "Assistant is currently disabled."


def test_redacts_sensitive_values():
    redacted, counts = redact_pii(
        "Call 555-123-4567, card 4242 4242 4242 4242, ssn 123-45-6789, email friend@example.com",
        current_user_email="owner@example.com",
    )

    assert "[REDACTED:phone]" in redacted
    assert "[REDACTED:credit_card]" in redacted
    assert "[REDACTED:ssn]" in redacted
    assert "[REDACTED:email]" in redacted
    assert counts["phone"] == 1


def test_policy_kb_answer_is_cited(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, org, location, _space = _seed_owner_location(db_session)
    db_session.add(
        OwnerPolicyKB(
            tenant_id=org.id,
            organization_id=org.id,
            location_id=location.id,
            category="parking",
            title="Parking",
            body="Use the north garage after 6pm.",
            is_active=True,
            updated_by_user_id=owner.id,
        )
    )
    db_session.commit()

    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})
    response = client.post(
        "/api/assistant/chat?stream=false",
        json={
            "message": "What is the parking policy?",
            "page_context": {"location_public_id": location.public_id},
        },
    )

    assert response.status_code == 200
    message = response.json()["message"]
    assert "north garage" in message["content"]
    assert message["citations"][0]["type"] == "policy"


def test_support_escalation_proposal_confirm_creates_ticket(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "Talk to a human"})

    assert response.status_code == 200
    proposal_id = response.json()["message"]["proposals"][0]["proposal_id"]
    confirm = client.post(f"/api/assistant/proposals/{proposal_id}/confirm", json={})
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "confirmed"


def test_assistant_rate_limit(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    monkeypatch.setattr(settings, "ASSISTANT_OWNER_PER_MINUTE", 1)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    assert client.post("/api/assistant/chat?stream=false", json={"message": "find rooms"}).status_code == 200
    response = client.post("/api/assistant/chat?stream=false", json={"message": "find rooms again"})
    assert response.status_code == 429
    assert response.json()["rate_limited"] is True


def test_marketplace_space_citation_uses_static_export_href(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "meeting room in Miami"})

    assert response.status_code == 200
    citations = response.json()["message"]["citations"]
    space_citation = next(item for item in citations if item["type"] == "space")
    parsed = urlparse(space_citation["url"])
    assert parsed.path == "/spaces/_.html"
    assert parse_qs(parsed.query)["id"] == [space.public_id]
    assert parse_qs(parsed.query)["back"] == ["/coworking"]


def test_admin_quality_requires_platform_admin(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    db_session.add(
        AssistantConversation(
            user_id=owner.id,
            audience="owner",
            escalation_state="none",
            title="Quality",
        )
    )
    db_session.commit()
    conversation = db_session.query(AssistantConversation).first()
    db_session.add(
        AssistantMessage(
            conversation_id=conversation.id,
            role="assistant",
            content="This policy has not been configured yet.",
            event_metadata={"events": [{"missing_policy_category": "wifi"}]},
            estimated_cost_usd=0,
        )
    )

    admin = User(
        email="platform-assistant@example.com",
        auth_subject="sub-platform-assistant",
        role=UserAppRole.OWNER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    db_session.add(PlatformTeamMember(user_id=admin.id, role=PlatformTeamRole.SUPPORT, is_active=True))
    db_session.commit()

    client = client_factory({"sub": admin.auth_subject, "email": admin.email, "email_verified": True})
    response = client.get("/api/admin/assistant-quality")
    assert response.status_code == 200
    assert response.json()["missing_policy_categories"][0]["category"] == "wifi"
