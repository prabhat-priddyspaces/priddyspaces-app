import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.marketing import MarketingTemplate
from app.services.marketing import render_marketing_template


def test_production_config_requires_security_settings():
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production", DEBUG=True, JWT_SECRET="short")


def test_config_ignores_removed_backend_oauth_env_keys():
    loaded = Settings(
        ENVIRONMENT="local",
        AUTH_JWKS_URL="https://idp.example.test/.well-known/jwks.json",
        AUTH_AUDIENCE="legacy-audience",
        AUTH_ISSUER="legacy-issuer",
    )

    assert loaded.CLERK_JWKS_URL == ""


def test_secret_encryption_uses_aead_and_detects_tampering(monkeypatch):
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIAL_ENCRYPTION_KEY", "x" * 32)
    token = encrypt_secret("sk_test_secret")

    assert token is not None
    assert token.startswith("v2:")
    assert decrypt_secret(token) == "sk_test_secret"

    tampered = token[:-2] + "aa"
    with pytest.raises(Exception):
        decrypt_secret(tampered)


def test_api_security_headers_are_added(client_factory):
    client = client_factory({})

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_sensitive_post_paths_are_rate_limited(client_factory, monkeypatch):
    monkeypatch.setattr(settings, "SENSITIVE_RATE_LIMIT_PER_MINUTE", 1)
    client = client_factory({})
    headers = {"x-forwarded-for": "203.0.113.55"}

    first = client.post("/auth/login", json={"email": "none@example.com", "password": "bad"}, headers=headers)
    second = client.post("/auth/login", json={"email": "none@example.com", "password": "bad"}, headers=headers)

    assert first.status_code == 401
    assert second.status_code == 429
    assert second.headers["retry-after"] == "60"


def test_marketing_template_html_is_sanitized():
    template = MarketingTemplate(
        organization_id=1,
        tenant_id=1,
        name="Promo",
        subject="Hello {{ member.first_name }}",
        html_body='<p>Hi</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
        text_body="Hi",
    )

    subject, html, text, missing = render_marketing_template(template, {"member": {"first_name": "Ava"}})

    assert subject == "Hello Ava"
    assert text == "Hi"
    assert missing == []
    assert html is not None
    assert "<script" not in html
    assert "javascript:" not in html
