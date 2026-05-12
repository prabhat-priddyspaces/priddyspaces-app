import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from app.assistant import runtime as assistant_runtime
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
        state="FL",
        lat=25.7617,
        lng=-80.1918,
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


def _add_meeting_location(db, org, *, name, city, state, lat, lng, price_hourly):
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name=name,
        address="200 Market St",
        city=city,
        state=state,
        lat=lat,
        lng=lng,
        timezone="UTC",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name=f"{name} Boardroom",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=8,
        price_hourly=price_hourly,
        availability_status=AvailabilityStatus.AVAILABLE,
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return location, space


def _last_assistant_message(db):
    return (
        db.query(AssistantMessage)
        .filter(AssistantMessage.role == "assistant")
        .order_by(AssistantMessage.id.desc())
        .first()
    )


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


def test_marketplace_location_citation_uses_static_export_href(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "meeting room in Miami"})

    assert response.status_code == 200
    citations = response.json()["message"]["citations"]
    location_citation = next(item for item in citations if item["type"] == "location")
    parsed = urlparse(location_citation["url"])
    assert parsed.path == "/meeting-rooms/_.html"
    assert parse_qs(parsed.query)["id"] == [location.public_id]


def test_near_me_without_coordinates_requests_location_action(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={"message": "show me cheapest location for meeting room near me"},
    )

    assert response.status_code == 200
    message = response.json()["message"]
    assert "need your location" in message["content"].lower()
    assert message["citations"] == []
    assert message["client_actions"][0]["kind"] == "request_location"
    assert message["client_actions"][0]["payload"]["radius_miles"] == 50


def test_near_me_with_coordinates_searches_meeting_rooms_within_radius(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, org, _location, _space = _seed_owner_location(db_session)
    _add_meeting_location(
        db_session,
        org,
        name="Fort Lauderdale Rooms",
        city="Fort Lauderdale",
        state="FL",
        lat=26.1224,
        lng=-80.1373,
        price_hourly=25,
    )
    _add_meeting_location(
        db_session,
        org,
        name="New York Rooms",
        city="New York",
        state="NY",
        lat=40.7128,
        lng=-74.0060,
        price_hourly=5,
    )
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={
            "message": "show me cheapest location for meeting room near me",
            "page_context": {
                "lat": 26.1320,
                "lng": -80.2624,
                "location_label": "Plantation, FL",
                "radius_miles": 50,
            },
        },
    )

    assert response.status_code == 200
    message = response.json()["message"]
    content = message["content"]
    assert "within 50 miles of Plantation, FL" in content
    assert "Fort Lauderdale Rooms" in content
    assert "New York Rooms" not in content
    assert "$25/hr" in content
    assert message["client_actions"] == []
    assert all(citation["type"] == "location" for citation in message["citations"])
    first_result = content.splitlines()[1]
    assert "Fort Lauderdale Rooms" in first_result


def test_near_me_no_results_does_not_fallback_to_unrelated_inventory(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={
            "message": "meeting room near me",
            "page_context": {
                "lat": 64.2008,
                "lng": -149.4937,
                "location_label": "Alaska",
                "radius_miles": 50,
            },
        },
    )

    assert response.status_code == 200
    message = response.json()["message"]
    assert "could not find meeting rooms within 50 miles of Alaska" in message["content"]
    assert "Assistant HQ" not in message["content"]
    assert message["client_actions"] == []


def test_explicit_new_york_search_still_uses_requested_city(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, org, _location, _space = _seed_owner_location(db_session)
    _add_meeting_location(
        db_session,
        org,
        name="New York Rooms",
        city="New York",
        state="NY",
        lat=40.7128,
        lng=-74.0060,
        price_hourly=55,
    )
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "meeting room in new york"})

    assert response.status_code == 200
    message = response.json()["message"]
    assert "New York Rooms" in message["content"]
    assert "Assistant HQ" not in message["content"]
    assert message["client_actions"] == []


def test_explicit_location_overrides_page_context_and_logs_mismatch(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, org, _location, _space = _seed_owner_location(db_session)
    _add_meeting_location(
        db_session,
        org,
        name="New York Rooms",
        city="New York",
        state="NY",
        lat=40.7128,
        lng=-74.0060,
        price_hourly=55,
    )
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={
            "message": "meeting room in new york",
            "page_context": {"q": "Plantation, FL", "lat": 26.1320, "lng": -80.2624, "radius_miles": 50},
        },
    )

    assert response.status_code == 200
    message = response.json()["message"]
    assert "New York Rooms" in message["content"]
    assert "Assistant HQ" not in message["content"]
    event_kinds = [event["kind"] for event in (_last_assistant_message(db_session).event_metadata or {}).get("events", [])]
    assert "context_mismatch" in event_kinds


def test_missing_booking_slots_logs_quality_event_and_clarify_action(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    member = User(
        email="member-assistant@example.com",
        auth_subject="sub-member-assistant",
        role=UserAppRole.MEMBER,
        email_verified=True,
        is_active=True,
    )
    db_session.add(member)
    db_session.commit()
    client = client_factory({"sub": member.auth_subject, "email": member.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "book a meeting room"})

    assert response.status_code == 200
    message = response.json()["message"]
    assert "space, start time, and end time" in message["content"]
    assert message["client_actions"][0]["kind"] == "clarify_input"
    event_kinds = [event["kind"] for event in (_last_assistant_message(db_session).event_metadata or {}).get("events", [])]
    assert "missing_required_slot" in event_kinds


def test_pricing_answer_includes_price_basis_and_citation(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "what is the price for meeting room in Miami"})

    assert response.status_code == 200
    message = response.json()["message"]
    assert "$40/hr" in message["content"]
    assert message["citations"][0]["type"] == "location"
    metadata = _last_assistant_message(db_session).event_metadata or {}
    assert metadata["intent"] == "pricing_quote"
    assert "price_basis" in metadata["answer_basis"]


def test_missing_policy_source_logs_reliability_event(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, location, _space = _seed_owner_location(db_session)
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={"message": "what is the wifi policy?", "page_context": {"location_public_id": location.public_id}},
    )

    assert response.status_code == 200
    assert response.json()["message"]["content"] == "This policy has not been configured yet."
    events = (_last_assistant_message(db_session).event_metadata or {}).get("events", [])
    assert {"kind": "missing_policy", "category": "wifi"} in events


def test_citation_missing_tool_answer_fails_closed(db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, _org, _location, _space = _seed_owner_location(db_session)
    monkeypatch.setattr(assistant_runtime, "_billing_response", lambda db, ctx: ("Found billing data.", [], []))
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post("/api/assistant/chat?stream=false", json={"message": "show me billing"})

    assert response.status_code == 200
    message = response.json()["message"]
    assert "could not answer reliably" in message["content"]
    assert message["citations"][0]["type"] == "assistant"
    event_kinds = [event["kind"] for event in (_last_assistant_message(db_session).event_metadata or {}).get("events", [])]
    assert "citation_missing_prevented" in event_kinds


@pytest.mark.parametrize(
    "case",
    json.loads((Path(__file__).with_name("assistant_evals.json")).read_text()),
    ids=lambda item: item["name"],
)
def test_assistant_golden_evals(case, db_session, client_factory, monkeypatch):
    monkeypatch.setattr(settings, "ASSISTANT_ENABLED", True)
    owner, org, _location, _space = _seed_owner_location(db_session)
    _add_meeting_location(
        db_session,
        org,
        name="New York Rooms",
        city="New York",
        state="NY",
        lat=40.7128,
        lng=-74.0060,
        price_hourly=55,
    )
    client = client_factory({"sub": owner.auth_subject, "email": owner.email, "email_verified": True})

    response = client.post(
        "/api/assistant/chat?stream=false",
        json={"message": case["message"], "page_context": case.get("page_context", {})},
    )

    assert response.status_code == 200
    content = response.json()["message"]["content"]
    for expected in case.get("contains", []):
        assert expected in content
    for forbidden in case.get("not_contains", []):
        assert forbidden not in content
    events = (_last_assistant_message(db_session).event_metadata or {}).get("events", [])
    event_kinds = [event.get("kind") for event in events]
    for expected_event in case.get("event_kinds", []):
        assert expected_event in event_kinds


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
