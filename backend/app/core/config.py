from pydantic_settings import BaseSettings, SettingsConfigDict


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
    AUTH_JWKS_URL: str = ""
    AUTH_AUDIENCE: str = ""
    AUTH_ISSUER: str = ""
    JWT_SECRET: str = ""
    JWT_ISSUER: str = "priddyspaces"
    JWT_AUDIENCE: str = "priddyspaces"
    JWT_EXPIRE_SECONDS: int = 86400
    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    OAUTH_GOOGLE_CLIENT_ID: str = ""
    OAUTH_GOOGLE_CLIENT_SECRET: str = ""
    OAUTH_APPLE_CLIENT_ID: str = ""
    OAUTH_APPLE_TEAM_ID: str = ""
    OAUTH_APPLE_KEY_ID: str = ""
    OAUTH_APPLE_PRIVATE_KEY: str = ""
    OAUTH_STATE_TTL_SECONDS: int = 600
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000"
    S3_BUCKET: str = ""
    S3_REGION: str = ""
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "no-reply@priddyspaces.local"
    PLATFORM_ADMIN_EMAILS: str = ""
    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
