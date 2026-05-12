from datetime import datetime, timedelta, timezone

from app.models.enums import UserAppRole, UserRole
from app.models.marketing import MarketingVerifiedSender, OutboundMessage, WorkflowRun
from app.models.org_member_profile import OrgMemberProfile
from app.models.organization import Organization
from app.models.organization_member import OrganizationMember
from app.models.user import User


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
