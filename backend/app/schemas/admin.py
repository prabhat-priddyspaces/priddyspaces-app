from pydantic import BaseModel, field_validator

from app.models.enums import OrganizationReviewStatus, PlatformTeamRole


class OrganizationAdminUpdate(BaseModel):
    review_status: OrganizationReviewStatus | None = None
    review_notes: str | None = None
    commission_override_pct: int | None = None

    @field_validator("commission_override_pct")
    @classmethod
    def validate_commission(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 0 or value > 100:
            raise ValueError("Commission must be between 0 and 100")
        return value


class PlatformTeamInviteIn(BaseModel):
    email: str
    role: PlatformTeamRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.lower().strip()
        if "@" not in cleaned:
            raise ValueError("Invalid email address")
        return cleaned


class PlatformTeamUpdateIn(BaseModel):
    role: PlatformTeamRole | None = None
    is_active: bool | None = None


class PlatformSettingsUpdateIn(BaseModel):
    default_owner_commission_pct: int

    @field_validator("default_owner_commission_pct")
    @classmethod
    def validate_commission(cls, value: int) -> int:
        if value < 0 or value > 100:
            raise ValueError("Commission must be between 0 and 100")
        return value


class ImpersonationStartIn(BaseModel):
    user_public_id: str
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 3:
            raise ValueError("Reason is required")
        return cleaned
