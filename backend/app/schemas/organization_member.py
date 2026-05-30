from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import UserRole


class OrganizationMemberCreate(BaseModel):
    user_public_id: str | None = None
    email: str | None = None
    role: UserRole
    can_override_pricing: bool = False
    receives_new_booking_email: bool | None = None
    receives_booking_start_push: bool | None = None
    receives_booking_end_push: bool | None = None
    location_public_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_identity(self):
        if not self.user_public_id and not self.email:
            raise ValueError("Either user_public_id or email is required")
        if self.email:
            email = self.email.lower().strip()
            if "@" not in email:
                raise ValueError("Invalid email address")
            self.email = email
        return self


class OrganizationMemberUpdate(BaseModel):
    receives_new_booking_email: bool | None = None
    receives_booking_start_push: bool | None = None
    receives_booking_end_push: bool | None = None


class OrganizationMemberOut(BaseModel):
    public_id: str
    user_id: int
    role: UserRole
    can_override_pricing: bool
    receives_new_booking_email: bool
    receives_booking_start_push: bool
    receives_booking_end_push: bool
    location_public_ids: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OrganizationMemberDetailOut(BaseModel):
    public_id: str
    user_id: int
    user_public_id: str
    user_email: str
    role: UserRole
    can_override_pricing: bool
    receives_new_booking_email: bool
    receives_booking_start_push: bool
    receives_booking_end_push: bool
    location_public_ids: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
