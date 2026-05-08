import json
import logging
import os

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
    DEBUG: bool = False
    DATABASE_URL: str = "postgresql+psycopg2://priddyspaces:priddyspaces@localhost:5432/priddyspaces"
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    DEFAULT_PAYMENT_PROVIDER: str = "stripe"
    PAYMENT_METHOD_REQUIRED_FOR_REQUEST: bool = True
    PAYMENT_CHARGE_ON_APPROVAL: bool = True
    PAYMENT_CREDENTIAL_ENCRYPTION_KEY: str = ""
    EMAIL_VERIFICATION_REQUIRED: bool = True
    # AWS (Secrets Manager key name for production; leave blank in local dev)
    AWS_SECRET_NAME: str = ""
    AWS_REGION: str = "us-east-1"

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
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "no-reply@priddyspaces.local"
    PLATFORM_ADMIN_EMAILS: str = ""
    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
