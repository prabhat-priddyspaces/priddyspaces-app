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


class OwnerInviteIn(BaseModel):
    email: str
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    company_name: str | None = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        cleaned = value.lower().strip()
        if "@" not in cleaned:
            raise ValueError("Invalid email address")
        return cleaned

    @field_validator("first_name", "last_name", "phone", "company_name")
    @classmethod
    def optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None


class PlatformTeamUpdateIn(BaseModel):
    role: PlatformTeamRole | None = None
    is_active: bool | None = None
    first_name: str | None = None
    last_name: str | None = None


class PlatformSettingsUpdateIn(BaseModel):
    default_owner_commission_pct: int | None = None
    priddy_points_enabled: bool | None = None
    priddy_signup_points: int | None = None
    priddy_point_value_cents: int | None = None
    priddy_allowed_space_types: list[str] | None = None
    priddy_allowed_booking_modes: list[str] | None = None
    booking_calendar_daily_prices_enabled: bool | None = None

    @field_validator("default_owner_commission_pct")
    @classmethod
    def validate_commission(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 0 or value > 100:
            raise ValueError("Commission must be between 0 and 100")
        return value

    @field_validator("priddy_signup_points")
    @classmethod
    def validate_priddy_signup_points(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value < 0 or value > 1000000:
            raise ValueError("Signup points must be between 0 and 1,000,000")
        return value

    @field_validator("priddy_point_value_cents")
    @classmethod
    def validate_priddy_point_value(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value != 1:
            raise ValueError("Priddy Points are currently fixed at 1 cent per point")
        return value

    @field_validator("priddy_allowed_space_types")
    @classmethod
    def validate_priddy_space_types(cls, value: list[str] | None) -> list[str] | None:
        allowed = {"private_office", "shared_desk", "conference_room", "virtual_office", "suite"}
        if value is None:
            return None
        cleaned = sorted({item for item in value if item in allowed})
        if not cleaned:
            raise ValueError("At least one eligible space type is required")
        return cleaned

    @field_validator("priddy_allowed_booking_modes")
    @classmethod
    def validate_priddy_booking_modes(cls, value: list[str] | None) -> list[str] | None:
        allowed = {"hourly", "day_pass"}
        if value is None:
            return None
        cleaned = sorted({item for item in value if item in allowed})
        if not cleaned:
            raise ValueError("At least one eligible booking mode is required")
        return cleaned


class PlatformProfileUpdateIn(BaseModel):
    first_name: str | None = None
    last_name: str | None = None


class PlatformPasswordUpdateIn(BaseModel):
    current_password: str | None = None
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
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
