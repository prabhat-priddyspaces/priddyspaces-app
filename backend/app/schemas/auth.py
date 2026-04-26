from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.enums import PlatformTeamRole, UserAppRole


class RegisterIn(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str
    role: UserAppRole
    terms_accepted: bool
    privacy_policy_accepted: bool

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value:
            raise ValueError("Invalid email address")
        return value.lower().strip()


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value:
            raise ValueError("Invalid email address")
        return value.lower().strip()


class TokenOut(BaseModel):
    access_token: str


class ImpersonationContextOut(BaseModel):
    is_impersonating: bool
    actor_public_id: str | None = None
    actor_email: str | None = None
    actor_platform_role: PlatformTeamRole | None = None
    target_public_id: str | None = None
    target_email: str | None = None
    reason: str | None = None


class MeOut(BaseModel):
    public_id: str
    email: str
    first_name: str | None
    last_name: str | None
    role: str | None
    app_role: UserAppRole | None
    platform_role: PlatformTeamRole | None
    default_route: str
    impersonation: ImpersonationContextOut
    terms_accepted_at: datetime | None
    privacy_policy_accepted_at: datetime | None


class MeUpdateIn(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    role: UserAppRole | None = None
    terms_accepted: bool | None = None
    privacy_policy_accepted: bool | None = None
