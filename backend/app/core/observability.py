"""Error tracking / observability wiring.

Sentry is initialized only when ``SENTRY_DSN`` is configured, so local dev and
CI (which leave it blank) are unaffected. ``capture_exception`` from
``sentry_sdk`` is itself a no-op when the SDK is uninitialized, so call sites
that report swallowed errors do not need to guard on configuration.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_initialized = False


def init_sentry() -> bool:
    """Initialize Sentry if a DSN is configured. Returns True when active.

    Safe to call more than once and safe to call when ``sentry-sdk`` is not
    installed — both cases no-op instead of raising.
    """
    global _initialized
    if _initialized or not settings.SENTRY_DSN:
        return _initialized

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
    except ImportError:  # pragma: no cover - depends on optional install
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed; error tracking disabled")
        return False

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        # Don't ship request bodies/PII to Sentry by default.
        send_default_pii=False,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )
    _initialized = True
    logger.info("Sentry error tracking initialized (environment=%s)", settings.ENVIRONMENT)
    return True


def capture_exception(exc: BaseException | None = None) -> None:
    """Report an exception to Sentry. No-op when the SDK is absent/unconfigured.

    Use at sites that intentionally swallow exceptions (e.g. deferred booking /
    payment side effects) so failures remain visible even though the request
    succeeds.
    """
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - depends on optional install
        return
    sentry_sdk.capture_exception(exc)
