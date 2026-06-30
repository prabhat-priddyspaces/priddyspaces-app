import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse

from app.api import access_passes, admin, admin_calendar, amenities, analytics, assistant, auth, booking_requests, booking_waitlist, bookings, cancellations, feature_flags, floor_plan_markers, floor_plans, health, invoices, locations, loyalty, marketplace, marketing, me, media, membership_plans, notifications, onboarding, organization_members, organizations, org_member_profiles, owner_bookings, owner_calendar, owner_payment_health, owner_payments, payments, pricing, space_booking_modes, space_setup_fees, space_types, space_volume_discounts, spaces, stripe_connect, subscriptions, user_preferences, webhooks, webhooks_clerk
from app.core.config import settings
from app.core.errors import error_code_for_status
from app.core.logging_config import RequestContextMiddleware, configure_logging, request_id_ctx
from app.core.observability import capture_exception, init_sentry
from app.core.rate_limit import RateLimitMiddleware

# Configure structured logging + error tracking before the app is built so
# startup logs/errors are captured. Both stay plain/no-op unless configured.
configure_logging(json_logs=settings.LOG_JSON, level=settings.LOG_LEVEL)
init_sentry()

app = FastAPI(title=settings.PROJECT_NAME)

allowed_origins = [origin.strip() for origin in settings.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if settings.is_production_like:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
# Added last so it is the outermost layer: the request id is set before any
# other middleware or handler runs (and therefore before they log).
app.add_middleware(RequestContextMiddleware)


def _cors_headers(origin: str | None) -> dict[str, str]:
    """Headers so browser allows the response when origin is allowed."""
    if not origin or origin not in allowed_origins:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
    }


def _error_response(
    status_code: int,
    detail,
    *,
    request: Request,
    extra: dict | None = None,
    headers: dict | None = None,
) -> JSONResponse:
    """Consistent error envelope: detail (kept for back-compat) + error_code +
    request_id (from the request-context middleware)."""
    response_headers = dict(_cors_headers(request.headers.get("origin")))
    if headers:
        response_headers.update(headers)
    content = {
        "detail": detail,
        "error_code": error_code_for_status(status_code),
        "request_id": request_id_ctx.get(),
    }
    if extra:
        content.update(extra)
    return JSONResponse(status_code=status_code, content=content, headers=response_headers)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return _error_response(exc.status_code, exc.detail, request=request, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return _error_response(422, jsonable_encoder(exc.errors()), request=request)


@app.exception_handler(Exception)
async def detailed_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """In DEBUG mode return full error detail and traceback for 500s."""
    # Custom Exception handlers mark the error "handled", so report it to
    # Sentry explicitly (no-op unless configured).
    capture_exception(exc)
    if settings.DEBUG:
        return _error_response(
            500,
            str(exc),
            request=request,
            extra={"type": type(exc).__name__, "traceback": traceback.format_exc()},
        )
    return _error_response(500, "Internal server error", request=request)


if allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(health.router, prefix="/api")
app.include_router(assistant.router, prefix="/api")
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(organizations.router, prefix="/api")
app.include_router(amenities.router, prefix="/api")
app.include_router(locations.router, prefix="/api")
app.include_router(spaces.router, prefix="/api")
app.include_router(space_types.router, prefix="/api")
app.include_router(bookings.router, prefix="/api")
app.include_router(booking_requests.router, prefix="/api")
app.include_router(booking_waitlist.router, prefix="/api")
app.include_router(access_passes.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(user_preferences.router, prefix="/api")
app.include_router(pricing.router, prefix="/api")
app.include_router(cancellations.router, prefix="/api")
app.include_router(feature_flags.router, prefix="/api")
app.include_router(stripe_connect.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(membership_plans.router, prefix="/api")
app.include_router(space_booking_modes.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(floor_plans.router, prefix="/api")
app.include_router(owner_payment_health.router, prefix="/api")
app.include_router(owner_payments.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(marketplace.router, prefix="/api")
app.include_router(floor_plan_markers.router, prefix="/api")
app.include_router(organization_members.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(owner_bookings.router, prefix="/api")
app.include_router(owner_calendar.router, prefix="/api")
app.include_router(org_member_profiles.router, prefix="/api")
app.include_router(admin_calendar.router, prefix="/api")
app.include_router(space_setup_fees.router, prefix="/api")
app.include_router(space_volume_discounts.router, prefix="/api")
app.include_router(marketing.router, prefix="/api")
app.include_router(loyalty.router, prefix="/api")
app.include_router(onboarding.router)
app.include_router(webhooks_clerk.router)


@app.get("/")
def root():
    return {"status": "ok", "service": settings.PROJECT_NAME}
