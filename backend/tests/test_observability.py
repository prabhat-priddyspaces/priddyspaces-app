"""Unit tests for the Sentry error-tracking wiring.

These are hermetic: ``sentry_sdk.init`` is stubbed so no client is created and
nothing is sent over the network.
"""

import pytest

from app.core import observability


@pytest.fixture(autouse=True)
def _reset_init_state():
    """Keep the module-level init flag from leaking between tests."""
    observability._initialized = False
    yield
    observability._initialized = False


def test_init_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.setattr(observability.settings, "SENTRY_DSN", "", raising=False)
    assert observability.init_sentry() is False


def test_capture_exception_is_noop_without_dsn():
    # Swallow-site reporting must never raise when Sentry is unconfigured.
    observability.capture_exception(ValueError("boom"))


def test_init_sentry_initializes_with_dsn(monkeypatch):
    captured = {}

    def fake_init(**kwargs):
        captured.update(kwargs)

    import sentry_sdk

    monkeypatch.setattr(sentry_sdk, "init", fake_init)
    monkeypatch.setattr(
        observability.settings,
        "SENTRY_DSN",
        "https://key@example.ingest.sentry.io/1",
        raising=False,
    )
    monkeypatch.setattr(observability.settings, "ENVIRONMENT", "production", raising=False)
    monkeypatch.setattr(observability.settings, "SENTRY_TRACES_SAMPLE_RATE", 0.25, raising=False)

    assert observability.init_sentry() is True
    assert captured["dsn"].startswith("https://")
    assert captured["environment"] == "production"
    assert captured["traces_sample_rate"] == 0.25
    # PII must stay off by default.
    assert captured["send_default_pii"] is False


def test_init_sentry_is_idempotent(monkeypatch):
    calls = []
    monkeypatch.setattr("sentry_sdk.init", lambda **kw: calls.append(kw))
    monkeypatch.setattr(
        observability.settings, "SENTRY_DSN", "https://key@example.ingest.sentry.io/1", raising=False
    )
    assert observability.init_sentry() is True
    assert observability.init_sentry() is True
    assert len(calls) == 1
