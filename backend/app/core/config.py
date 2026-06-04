import json
import logging
import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _load_aws_secrets() -> None:
    """Fetch a JSON blob from AWS Secrets Manager and merge into os.environ.

    Activated when AWS_SECRET_NAME is set (production / staging).
    No-op in local dev where .env files are used instead.
    Explicit env vars (e.g., injected by ECS SecretOptions) take precedence.
    """
    secret_name = os.environ.get("AWS_SECRET_NAME")
    if not secret_name:
        return
    region = os.environ.get("AWS_REGION", "us-east-1")
    try:
        import boto3

        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_name)
        secrets: dict = json.loads(response["SecretString"])
        injected = 0
        for key, value in secrets.items():
            if key not in os.environ:
                os.environ[key] = str(value)
                injected += 1
        logger.info("Loaded %d secrets from Secrets Manager (%s)", injected, secret_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load secrets from AWS Secrets Manager: %s", exc)


_load_aws_secrets()


class Settings(BaseSettings):
    PROJECT_NAME: str = "Priddyspaces Coworking API"
    ENVIRONMENT: str = "local"
    DEBUG: bool = False
    DATABASE_URL: str = "postgresql+psycopg2://priddyspaces:priddyspaces@localhost:5432/priddyspaces"
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    DEFAULT_PAYMENT_PROVIDER: str = "stripe"
    PAYMENT_METHOD_REQUIRED_FOR_REQUEST: bool = True
    PAYMENT_CHARGE_ON_APPROVAL: bool = True
    PAYMENT_CREDENTIAL_ENCRYPTION_KEY: str = ""
    EMAIL_VERIFICATION_REQUIRED: bool = True
    API_RATE_LIMIT_ENABLED: bool = True
    SENSITIVE_RATE_LIMIT_PER_MINUTE: int = 600
    WEBHOOK_RATE_LIMIT_PER_MINUTE: int = 1200
    # AWS (Secrets Manager key name for production; leave blank in local dev)
    AWS_SECRET_NAME: str = ""
    AWS_REGION: str = "us-east-1"

    # Error tracking (Sentry). All Sentry calls are no-ops until SENTRY_DSN is
    # set, so leaving this blank in local dev/CI is safe.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0

    # Internal JWT (legacy email/password flow + admin impersonation tokens).
    # Clerk handles primary auth, but issue_token() in app/core/jwt.py still
    # mints these for the impersonation stop endpoint.
    JWT_SECRET: str = ""
    JWT_ISSUER: str = "priddyspaces"
    JWT_AUDIENCE: str = "priddyspaces"
    JWT_EXPIRE_SECONDS: int = 86400

    # Clerk — identity provider
    CLERK_SECRET_KEY: str = ""
    CLERK_WEBHOOK_SECRET: str = ""
    CLERK_JWKS_URL: str = ""
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000"
    S3_BUCKET: str = ""
    S3_REGION: str = ""
    S3_PUBLIC_BASE_URL: str = ""
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "no-reply@priddyspaces.com"
    SENDGRID_MARKETING_FROM_EMAIL: str = "no-reply@priddyspaces.com"
    SENDGRID_MARKETING_FROM_NAME: str = "Priddyspaces"
    SENDGRID_MARKETING_ASM_GROUP_ID: int = 0
    SENDGRID_WEBHOOK_VERIFICATION_KEY: str = ""
    MARKETING_LINK_SECRET: str = ""
    PLATFORM_ADMIN_EMAILS: str = ""

    # Assistant V1 is on by default. Set ASSISTANT_ENABLED=false in the env to
    # hide the widget for a given deployment.
    ASSISTANT_ENABLED: bool = True
    OPENAI_API_KEY: str = ""
    ASSISTANT_PRIMARY_MODEL: str = "gpt-4o"
    ASSISTANT_SUMMARY_MODEL: str = "gpt-4o-mini"
    ASSISTANT_DAILY_COST_CAP_USD: float = 50.0
    ASSISTANT_MAX_TOOL_HOPS: int = 5
    ASSISTANT_SUPPORT_EMAIL: str = ""
    ASSISTANT_ANON_PER_MINUTE: int = 5
    ASSISTANT_ANON_PER_DAY: int = 30
    ASSISTANT_GUEST_PER_MINUTE: int = 10
    ASSISTANT_GUEST_PER_DAY: int = 50
    ASSISTANT_MEMBER_PER_MINUTE: int = 20
    ASSISTANT_MEMBER_PER_DAY: int = 200
    ASSISTANT_STAFF_PER_MINUTE: int = 30
    ASSISTANT_STAFF_PER_DAY: int = 500
    ASSISTANT_OWNER_PER_MINUTE: int = 40
    ASSISTANT_OWNER_PER_DAY: int = 1000
    ASSISTANT_PLATFORM_ADMIN_PER_MINUTE: int = 60
    ASSISTANT_PLATFORM_ADMIN_PER_DAY: int = 1000000
    ASSISTANT_PRIMARY_INPUT_COST_PER_1M: float = 5.0
    ASSISTANT_PRIMARY_OUTPUT_COST_PER_1M: float = 15.0
    ASSISTANT_SUMMARY_INPUT_COST_PER_1M: float = 0.15
    ASSISTANT_SUMMARY_OUTPUT_COST_PER_1M: float = 0.60

    # Background worker. The worker is a standalone ECS service that uses the
    # same backend image with `python -m app.worker` as its command.
    WORKER_INTERVAL_SECONDS: int = 60
    WORKER_BATCH_LIMIT: int = 100
    WORKER_ENABLE_MARKETING: bool = True
    WORKER_ENABLE_ASSISTANT_JOBS: bool = True
    WORKER_ENABLE_BOOKING_REMINDER_PUSH: bool = True
    WORKER_ENABLE_CARDPOINTE_SETTLEMENTS: bool = True
    WORKER_ENABLE_BOOKING_HOLD_EXPIRY: bool = True
    WORKER_CARDPOINTE_MAX_AGE_DAYS: int = 7

    # Push notifications.
    WEB_PUSH_VAPID_PUBLIC_KEY: str = ""
    WEB_PUSH_VAPID_PRIVATE_KEY: str = ""
    WEB_PUSH_VAPID_SUBJECT: str = "mailto:no-reply@priddyspaces.com"
    EXPO_PUSH_ACCESS_TOKEN: str = ""

    @property
    def is_production_like(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in {"staging", "production", "prod"}

    @model_validator(mode="after")
    def validate_runtime_security(self) -> "Settings":
        if not self.is_production_like:
            return self

        missing = [
            name
            for name in [
                "DATABASE_URL",
                "CLERK_JWKS_URL",
                "CLERK_SECRET_KEY",
                "CLERK_WEBHOOK_SECRET",
                "JWT_SECRET",
                "PAYMENT_CREDENTIAL_ENCRYPTION_KEY",
                "CORS_ALLOW_ORIGINS",
                "FRONTEND_URL",
                "BACKEND_URL",
            ]
            if not str(getattr(self, name, "") or "").strip()
        ]
        if missing:
            raise ValueError(f"Missing required {self.ENVIRONMENT} setting(s): {', '.join(missing)}")
        if self.DEBUG:
            raise ValueError("DEBUG must be false in staging/production")
        if "*" in self.CORS_ALLOW_ORIGINS:
            raise ValueError("Wildcard CORS origins are not allowed in staging/production")
        if "localhost" in self.DATABASE_URL or "priddyspaces:priddyspaces" in self.DATABASE_URL:
            raise ValueError("DATABASE_URL must not use local defaults in staging/production")
        if not self.FRONTEND_URL.startswith("https://") or not self.BACKEND_URL.startswith("https://"):
            raise ValueError("FRONTEND_URL and BACKEND_URL must use HTTPS in staging/production")
        origins = [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]
        if not origins or any(not origin.startswith("https://") for origin in origins):
            raise ValueError("CORS_ALLOW_ORIGINS must contain only HTTPS origins in staging/production")
        if len(self.JWT_SECRET) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters in staging/production")
        if len(self.PAYMENT_CREDENTIAL_ENCRYPTION_KEY) < 32:
            raise ValueError("PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters")
        return self

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
