from datetime import datetime, timedelta, timezone

from app.models.booking import Booking
from app.models.booking_request import BookingRequest
from app.models.enums import (
    AvailabilityStatus,
    BookingRequestStatus,
    BookingStatus,
    SpaceType,
    SpaceVisibility,
    UserAppRole,
    UserRole,
)
from app.models.location import Location
from app.models.marketing import MarketingTemplate, MarketingVerifiedSender, OutboundMessage, WorkflowRun
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.space import Space
from app.models.user import User
from app.services import notifications
from app.services.booking_email_delivery import BOOKING_EMAIL_CONFIRMED, BOOKING_EMAIL_INVOICE_RECEIPT, BOOKING_EMAIL_WELCOME
from app.services.notifications import send_booking_confirmed_email, send_booking_transactional_email
from app.services.transactional_templates import TRANSACTIONAL_TEMPLATE_CATEGORY


def _user(db, email: str, sub: str, role: UserAppRole = UserAppRole.MEMBER) -> User:
    user = User(email=email, auth_subject=sub, role=role, email_verified=True, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _org(db, owner: User) -> Organization:
    org = Organization(name="Marketing Org", owner_id=owner.id)
    db.add(org)
    db.commit()
    db.refresh(org)
    db.add(
        OrganizationMember(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=owner.id,
            role=UserRole.OWNER,
            is_active=True,
        )
    )
    db.commit()
    return org


def _client(client_factory, user: User):
    return client_factory({"sub": user.auth_subject, "email": user.email, "email_verified": True})


def _member(db, org: Organization, email: str, sub: str, *, status: str = "active", tags: str | None = None) -> User:
    member = _user(db, email, sub)
    db.add(
        OrgMemberProfile(
            organization_id=org.id,
            tenant_id=org.id,
            user_id=member.id,
            status=status,
            tags=tags,
        )
    )
    db.commit()
    return member


def _template(client, org: Organization):
    response = client.post(
        "/api/marketing/templates",
        json={
            "organization_public_id": org.public_id,
            "name": "Welcome",
            "subject": "Hi {{ member.first_name }}",
            "html_body": "<p>{{ business.name }}</p><a href=\"{{ links.unsubscribe }}\">Unsubscribe</a>",
            "text_body": "Hi {{ member.full_name }}",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_template_validation_rejects_unknown_variables(db_session, client_factory):
    owner = _user(db_session, "owner@example.com", "sub-owner", UserAppRole.OWNER)
    org = _org(db_session, owner)
    client = _client(client_factory, owner)

    response = client.post(
        "/api/marketing/templates",
        json={
            "organization_public_id": org.public_id,
            "name": "Bad",
            "subject": "Hi {{ member.password }}",
            "text_body": "Body",
        },
    )

    assert response.status_code == 400
    assert "member.password" in response.text


def test_transactional_defaults_seed_for_owner_templates(db_session, client_factory):
    owner = _user(db_session, "owner-defaults@example.com", "sub-owner-defaults", UserAppRole.OWNER)
    org = _org(db_session, owner)
    client = _client(client_factory, owner)

    response = client.get(f"/api/marketing/templates?organization_public_id={org.public_id}")

    assert response.status_code == 200
    classifications = {
        item["classification"]
        for item in response.json()
        if item["category"] == TRANSACTIONAL_TEMPLATE_CATEGORY
    }
    assert {
        "welcome_letter",
        "reservation_confirmation",
        "reservation_reminder",
        "invoice_receipt",
        "payment_failed",
        "card_expiring",
    }.issubset(classifications)


def test_template_validation_allows_transactional_shortcodes(db_session, client_factory):
    owner = _user(db_session, "owner-shortcodes@example.com", "sub-owner-shortcodes", UserAppRole.OWNER)
    org = _org(db_session, owner)
    client = _client(client_factory, owner)

    response = client.post(
        "/api/marketing/templates",
        json={
            "organization_public_id": org.public_id,
            "name": "Card notice",
            "subject": "Card {{ card.last4 }} for {{ owner.email }}",
            "text_body": "Retry: {{ links.retry_payment }} Amount: {{ payment.amount }}",
            "category": "transactional",
            "classification": "card_expiring",
        },
    )

    assert response.status_code == 200, response.text
    assert "card.last4" in response.json()["variables"]
    assert "owner.email" in response.json()["variables"]


def test_transactional_template_overrides_booking_email(db_session):
    owner = _user(db_session, "owner-render@example.com", "sub-owner-render", UserAppRole.OWNER)
    owner.first_name = "Owner"
    db_session.add(owner)
    db_session.commit()
    org = _org(db_session, owner)
    member = _member(db_session, org, "member-render@example.com", "sub-member-render")
    member.first_name = "Riley"
    db_session.add(member)
    template = MarketingTemplate(
        organization_id=org.id,
        tenant_id=org.id,
        name="Custom confirmation",
        subject="Confirmed for {{ member.first_name }}",
        text_body="Hi {{ member.first_name }} from {{ business.name }}",
        html_body="<p>{{ owner.email }}</p>",
        category=TRANSACTIONAL_TEMPLATE_CATEGORY,
        classification="reservation_confirmation",
        variables=["member.first_name", "business.name", "owner.email"],
    )
    db_session.add(template)
    db_session.commit()

    outbound = send_booking_transactional_email(
        db_session,
        to_email=member.email,
        subject="Fallback subject",
        body="Fallback body",
        notification_type=BOOKING_EMAIL_CONFIRMED,
        recipient_role="member",
        recipient_user_id=member.id,
        organization_id=org.id,
        tenant_id=org.id,
        source="transactional",
    )

    assert outbound.subject == "Confirmed for Riley"
    assert outbound.text_body == "Hi Riley from Marketing Org"
    assert outbound.template_id == template.id
    assert outbound.source_context["template_public_id"] == template.public_id
    assert outbound.source_context["template_classification"] == "reservation_confirmation"


def test_transactional_template_falls_back_when_render_missing(db_session):
    owner = _user(db_session, "owner-fallback@example.com", "sub-owner-fallback", UserAppRole.OWNER)
    org = _org(db_session, owner)
    member = _member(db_session, org, "member-fallback@example.com", "sub-member-fallback")
    template = MarketingTemplate(
        organization_id=org.id,
        tenant_id=org.id,
        name="Broken invoice",
        subject="Invoice",
        text_body="{{ unknown.value }}",
        category=TRANSACTIONAL_TEMPLATE_CATEGORY,
        classification="invoice_receipt",
        variables=[],
    )
    db_session.add(template)
    db_session.commit()

    outbound = send_booking_transactional_email(
        db_session,
        to_email=member.email,
        subject="Fallback invoice",
        body="Fallback invoice body",
        notification_type=BOOKING_EMAIL_INVOICE_RECEIPT,
        recipient_role="member",
        recipient_user_id=member.id,
        organization_id=org.id,
        tenant_id=org.id,
        source="transactional",
    )

    assert outbound.subject == "Fallback invoice"
    assert outbound.text_body == "Fallback invoice body"
    assert outbound.source_context["template_public_id"] == template.public_id
    assert "template_fallback_reason" in outbound.source_context


def test_booking_confirmation_sends_welcome_only_for_first_confirmed_booking(db_session, monkeypatch):
    monkeypatch.setattr(notifications.settings, "SENDGRID_API_KEY", "")
    monkeypatch.setattr(notifications.settings, "SENDGRID_FROM_EMAIL", "")

    owner = _user(db_session, "owner-welcome@example.com", "sub-owner-welcome", UserAppRole.OWNER)
    org = _org(db_session, owner)
    member = _member(db_session, org, "member-welcome@example.com", "sub-member-welcome")
    location = Location(
        organization_id=org.id,
        tenant_id=org.id,
        name="Welcome Location",
        address="1 Welcome Way",
        timezone="UTC",
    )
    db_session.add(location)
    db_session.commit()
    db_session.refresh(location)
    space = Space(
        location_id=location.id,
        tenant_id=org.id,
        name="Welcome Room",
        space_type=SpaceType.CONFERENCE_ROOM,
        capacity=4,
        availability_status=AvailabilityStatus.AVAILABLE,
        visibility=SpaceVisibility.PUBLIC,
    )
    db_session.add(space)
    db_session.commit()
    db_session.refresh(space)

    def _confirmed_request(day: int) -> tuple[BookingRequest, Booking]:
        booking = Booking(
            user_id=member.id,
            space_id=space.id,
            tenant_id=org.id,
            start_datetime=datetime(2026, 6, day, 10, 0, tzinfo=timezone.utc),
            end_datetime=datetime(2026, 6, day, 11, 0, tzinfo=timezone.utc),
            status=BookingStatus.CONFIRMED,
        )
        db_session.add(booking)
        db_session.flush()
        req = BookingRequest(
            tenant_id=org.id,
            user_id=member.id,
            space_id=space.id,
            booking_id=booking.id,
            start_datetime=booking.start_datetime,
            end_datetime=booking.end_datetime,
            status=BookingRequestStatus.APPROVED,
        )
        db_session.add(req)
        db_session.commit()
        db_session.refresh(booking)
        db_session.refresh(req)
        return req, booking

    req_one, booking_one = _confirmed_request(1)
    send_booking_confirmed_email(db_session, req_one, booking_one, space, location)
    req_two, booking_two = _confirmed_request(2)
    send_booking_confirmed_email(db_session, req_two, booking_two, space, location)

    welcome_rows = db_session.query(OutboundMessage).filter(OutboundMessage.user_id == member.id).all()
    welcome_rows = [
        row
        for row in welcome_rows
        if (row.source_context or {}).get("notification_type") == BOOKING_EMAIL_WELCOME
    ]
    assert len(welcome_rows) == 1
    assert welcome_rows[0].source_context["booking_public_id"] == booking_one.public_id


def test_segment_preview_uses_only_org_crm_members(db_session, client_factory):
    owner_one = _user(db_session, "one@example.com", "sub-one", UserAppRole.OWNER)
    owner_two = _user(db_session, "two@example.com", "sub-two", UserAppRole.OWNER)
    org_one = _org(db_session, owner_one)
    org_two = _org(db_session, owner_two)
    _member(db_session, org_one, "active@example.com", "sub-active", status="active", tags='["vip"]')
    _member(db_session, org_one, "lead@example.com", "sub-lead", status="lead")
    _member(db_session, org_two, "other@example.com", "sub-other", status="active", tags='["vip"]')

    client = _client(client_factory, owner_one)
    response = client.post(
        "/api/marketing/segments/preview-count",
        json={"organization_public_id": org_one.public_id, "filters": {"status": "active", "tags": ["vip"]}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["sample"][0]["email"] == "active@example.com"


def test_campaign_send_snapshots_and_respects_suppressions(db_session, client_factory):
    owner = _user(db_session, "owner-send@example.com", "sub-owner-send", UserAppRole.OWNER)
    org = _org(db_session, owner)
    _member(db_session, org, "ok@example.com", "sub-ok")
    _member(db_session, org, "blocked@example.com", "sub-blocked")
    client = _client(client_factory, owner)
    template = _template(client, org)

    suppression = client.post(
        "/api/marketing/suppressions",
        json={"organization_public_id": org.public_id, "email": "blocked@example.com", "reason": "manual"},
    )
    assert suppression.status_code == 200

    campaign = client.post(
        "/api/marketing/campaigns",
        json={
            "organization_public_id": org.public_id,
            "name": "May update",
            "template_public_id": template["public_id"],
            "sender_lane": "shared",
        },
    )
    assert campaign.status_code == 200
    campaign_id = campaign.json()["public_id"]

    review = client.get(f"/api/marketing/campaigns/{campaign_id}/review-breakdown")
    assert review.status_code == 200
    assert review.json()["eligible"] == 1
    assert review.json()["suppressed"] == 1

    sent = client.post(f"/api/marketing/campaigns/{campaign_id}/send", json={})
    assert sent.status_code == 200
    assert sent.json()["sent_count"] == 1
    assert sent.json()["suppressed_count"] == 1

    resent = client.post(f"/api/marketing/campaigns/{campaign_id}/send", json={})
    assert resent.status_code == 400

    recipients = client.get(f"/api/marketing/campaigns/{campaign_id}/recipients").json()
    assert sorted(row["status"] for row in recipients) == ["sent", "suppressed"]


def test_pending_verified_sender_blocks_campaign_creation(db_session, client_factory):
    owner = _user(db_session, "owner-vs@example.com", "sub-owner-vs", UserAppRole.OWNER)
    org = _org(db_session, owner)
    _member(db_session, org, "member-vs@example.com", "sub-member-vs")
    client = _client(client_factory, owner)
    template = _template(client, org)

    sender = client.post(
        "/api/marketing/settings/verified-senders",
        json={"organization_public_id": org.public_id, "email": "marketing@example.com", "name": "Business"},
    )
    assert sender.status_code == 200
    settings = client.put(
        "/api/marketing/settings/sender",
        json={
            "organization_public_id": org.public_id,
            "default_sender_lane": "verified_sender",
            "verified_sender_public_id": sender.json()["public_id"],
        },
    )
    assert settings.status_code == 200

    campaign = client.post(
        "/api/marketing/campaigns",
        json={
            "organization_public_id": org.public_id,
            "name": "Blocked verified sender",
            "template_public_id": template["public_id"],
            "sender_lane": "verified_sender",
        },
    )
    assert campaign.status_code == 400
    assert "not ready" in campaign.text


def test_verified_sender_can_send_when_marked_verified(db_session, client_factory):
    owner = _user(db_session, "owner-verified@example.com", "sub-owner-verified", UserAppRole.OWNER)
    org = _org(db_session, owner)
    _member(db_session, org, "member-verified@example.com", "sub-member-verified")
    sender = MarketingVerifiedSender(
        organization_id=org.id,
        tenant_id=org.id,
        email="marketing@example.com",
        name="Business",
        status="verified",
    )
    db_session.add(sender)
    db_session.commit()
    db_session.refresh(sender)
    client = _client(client_factory, owner)
    template = _template(client, org)
    settings = client.put(
        "/api/marketing/settings/sender",
        json={
            "organization_public_id": org.public_id,
            "default_sender_lane": "verified_sender",
            "verified_sender_public_id": sender.public_id,
        },
    )
    assert settings.status_code == 200

    campaign = client.post(
        "/api/marketing/campaigns",
        json={
            "organization_public_id": org.public_id,
            "name": "Verified sender",
            "template_public_id": template["public_id"],
            "sender_lane": "verified_sender",
        },
    )
    assert campaign.status_code == 200
    sent = client.post(f"/api/marketing/campaigns/{campaign.json()['public_id']}/send", json={})
    assert sent.status_code == 200
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.organization_id == org.id).order_by(OutboundMessage.id.desc()).first()
    assert outbound.sender_lane == "verified_sender"
    assert outbound.from_email == "marketing@example.com"


def test_daily_cap_prevents_over_limit_send(db_session, client_factory):
    owner = _user(db_session, "owner-cap@example.com", "sub-owner-cap", UserAppRole.OWNER)
    org = _org(db_session, owner)
    org.shared_daily_cap = 0
    db_session.add(org)
    db_session.commit()
    _member(db_session, org, "cap@example.com", "sub-cap")
    client = _client(client_factory, owner)
    template = _template(client, org)
    campaign = client.post(
        "/api/marketing/campaigns",
        json={"organization_public_id": org.public_id, "name": "Cap", "template_public_id": template["public_id"]},
    ).json()

    sent = client.post(f"/api/marketing/campaigns/{campaign['public_id']}/send", json={})

    assert sent.status_code == 200
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.organization_id == org.id).first()
    assert outbound.status == "failed"
    assert "Daily sender cap" in outbound.error


def test_sendgrid_webhook_updates_message_and_suppression(db_session, client_factory):
    owner = _user(db_session, "owner-hook@example.com", "sub-owner-hook", UserAppRole.OWNER)
    org = _org(db_session, owner)
    _member(db_session, org, "hook@example.com", "sub-hook")
    client = _client(client_factory, owner)
    template = _template(client, org)
    campaign = client.post(
        "/api/marketing/campaigns",
        json={"organization_public_id": org.public_id, "name": "Hook", "template_public_id": template["public_id"]},
    ).json()
    client.post(f"/api/marketing/campaigns/{campaign['public_id']}/send", json={})
    outbound = db_session.query(OutboundMessage).filter(OutboundMessage.organization_id == org.id).first()

    response = client.post(
        "/api/webhooks/sendgrid",
        json=[
            {"event": "open", "email": "hook@example.com", "sg_event_id": "evt-open", "outbound_public_id": outbound.public_id},
            {"event": "unsubscribe", "email": "hook@example.com", "sg_event_id": "evt-unsub", "outbound_public_id": outbound.public_id},
        ],
    )

    assert response.status_code == 200
    db_session.refresh(outbound)
    assert outbound.opens == 1
    assert outbound.status == "unsubscribed"
    suppressions = client.get(f"/api/marketing/suppressions?organization_public_id={org.public_id}").json()
    assert suppressions[0]["email"] == "hook@example.com"
    assert suppressions[0]["reason"] == "unsubscribe"


def test_workflow_publish_activate_and_tick_send(db_session, client_factory):
    owner = _user(db_session, "owner-flow@example.com", "sub-owner-flow", UserAppRole.OWNER)
    org = _org(db_session, owner)
    _member(db_session, org, "flow@example.com", "sub-flow")
    client = _client(client_factory, owner)
    template = _template(client, org)
    graph = {
        "nodes": [
            {"id": "trigger", "type": "trigger", "data": {"trigger": "segment_entry", "filters": {"status": "active"}}},
            {"id": "send", "type": "send_email", "data": {"template_public_id": template["public_id"], "sender_lane": "shared"}},
            {"id": "stop", "type": "stop", "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "trigger", "target": "send"},
            {"id": "e2", "source": "send", "target": "stop"},
        ],
    }
    workflow = client.post(
        "/api/marketing/workflows",
        json={"organization_public_id": org.public_id, "name": "Welcome flow", "graph": graph},
    )
    assert workflow.status_code == 200
    workflow_id = workflow.json()["public_id"]
    assert client.post(f"/api/marketing/workflows/{workflow_id}/publish").status_code == 200
    assert client.post(f"/api/marketing/workflows/{workflow_id}/activate").status_code == 200

    run = db_session.query(WorkflowRun).filter(WorkflowRun.organization_id == org.id).first()
    assert run is not None
    run.next_run_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.add(run)
    db_session.commit()

    from app.services.marketing import tick_marketing

    result = tick_marketing(db_session)

    assert result["workflow_runs_advanced"] >= 1
    assert db_session.query(OutboundMessage).filter(OutboundMessage.workflow_run_id == run.id).count() == 1
