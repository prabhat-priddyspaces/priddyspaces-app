from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest

from app.core.config import settings
from app.models.email_subscription_group import EmailSubscriptionGroup
from app.models.user import User
from app.services.notifications import send_email


@pytest.fixture(autouse=True)
def _configure_sendgrid(monkeypatch):
    monkeypatch.setattr(settings, "SENDGRID_API_KEY", "SG.test")
    monkeypatch.setattr(settings, "SENDGRID_FROM_EMAIL", "no-reply@priddyspaces.test")


def _patched_post():
    response = MagicMock()
    response.status_code = 202
    response.text = ""
    return patch("app.services.notifications.httpx.post", return_value=response)


def _make_user(db, email: str, *, unsubscribed_at=None) -> User:
    user = User(
        email=email,
        full_name="Test User",
        is_active=True,
        email_verified=True,
        email_unsubscribed_at=unsubscribed_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_send_email_skipped_when_user_globally_unsubscribed(db_session):
    _make_user(db_session, "blocked@example.com", unsubscribed_at=datetime.now(timezone.utc))

    with _patched_post() as mock_post:
        send_email(
            to_email="blocked@example.com",
            subject="Hello",
            body="Body",
            db=db_session,
        )
    mock_post.assert_not_called()


def test_send_email_sent_when_user_subscribed(db_session):
    _make_user(db_session, "ok@example.com")

    with _patched_post() as mock_post:
        send_email(
            to_email="ok@example.com",
            subject="Hello",
            body="Body",
            db=db_session,
        )
    mock_post.assert_called_once()


def test_send_email_works_without_db_session():
    with _patched_post() as mock_post:
        send_email(to_email="anyone@example.com", subject="Hi", body="Body")
    mock_post.assert_called_once()


def test_send_email_includes_html_and_attachments():
    attachment = {
        "content": "Qk9EWQ==",
        "type": "text/calendar",
        "filename": "booking.ics",
        "disposition": "attachment",
    }
    with _patched_post() as mock_post:
        send_email(
            to_email="calendar@example.com",
            subject="Calendar",
            body="Plain",
            html_body="<p>HTML</p>",
            attachments=[attachment],
        )
    payload = mock_post.call_args.kwargs["json"]
    assert payload["content"] == [
        {"type": "text/plain", "value": "Plain"},
        {"type": "text/html", "value": "<p>HTML</p>"},
    ]
    assert payload["attachments"] == [attachment]


def test_send_email_skipped_when_group_unsubscribed(db_session):
    _make_user(db_session, "groups@example.com")
    db_session.add(
        EmailSubscriptionGroup(
            email="groups@example.com",
            asm_group_id=42,
            status="unsubscribed",
        )
    )
    db_session.commit()

    with _patched_post() as mock_post:
        send_email(
            to_email="groups@example.com",
            subject="Promo",
            body="Body",
            db=db_session,
            asm_group_id=42,
        )
    mock_post.assert_not_called()


def test_send_email_sent_when_group_subscribed(db_session):
    _make_user(db_session, "ok-group@example.com")
    db_session.add(
        EmailSubscriptionGroup(
            email="ok-group@example.com",
            asm_group_id=42,
            status="subscribed",
        )
    )
    db_session.commit()

    with _patched_post() as mock_post:
        send_email(
            to_email="ok-group@example.com",
            subject="Promo",
            body="Body",
            db=db_session,
            asm_group_id=42,
        )
    mock_post.assert_called_once()
    sent_payload = mock_post.call_args.kwargs["json"]
    assert sent_payload["asm"] == {"group_id": 42}


def test_send_email_skipped_when_global_unsubscribe_overrides_group(db_session):
    _make_user(
        db_session,
        "global@example.com",
        unsubscribed_at=datetime.now(timezone.utc),
    )
    db_session.add(
        EmailSubscriptionGroup(
            email="global@example.com",
            asm_group_id=42,
            status="subscribed",
        )
    )
    db_session.commit()

    with _patched_post() as mock_post:
        send_email(
            to_email="global@example.com",
            subject="Promo",
            body="Body",
            db=db_session,
            asm_group_id=42,
        )
    mock_post.assert_not_called()
