from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas._phone import PhoneStr
from app.schemas.amenity import AmenityOut
from app.models.enums import BookingGranularity, LocationStatus
from app.schemas.working_hours import PublicWorkingHour


class LocationCreate(BaseModel):
    organization_public_id: str
    name: str
    address: str
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    neighborhood: str | None = None
    timezone: str
    lat: float | None = None
    lng: float | None = None
    public_phone: PhoneStr | None = None
    public_email: str | None = None
    public_hours_weekdays: str | None = None
    public_hours_weekends: str | None = None
    public_working_hours_enabled: bool = False
    public_working_hours: list[PublicWorkingHour] | None = None
    public_parking_notes: str | None = None
    public_transit_notes: str | None = None
    public_included_items: str | None = None
    booking_granularity: BookingGranularity = BookingGranularity.MIN_60
    amenity_ids: list[int] = Field(default_factory=list)

    @field_validator("amenity_ids")
    @classmethod
    def dedupe_amenity_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class LocationOut(BaseModel):
    public_id: str
    organization_public_id: str
    organization_name: str | None = None
    name: str
    address: str
    city: str | None
    state: str | None = None
    postal_code: str | None = None
    neighborhood: str | None = None
    timezone: str
    lat: float | None = None
    lng: float | None = None
    public_phone: str | None = None
    public_email: str | None = None
    public_hours_weekdays: str | None = None
    public_hours_weekends: str | None = None
    public_working_hours_enabled: bool = False
    public_working_hours: list[PublicWorkingHour] = Field(default_factory=list)
    public_parking_notes: str | None = None
    public_transit_notes: str | None = None
    public_included_items: str | None = None
    status: LocationStatus
    booking_granularity: BookingGranularity
    amenities: list[AmenityOut] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class LocationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    neighborhood: str | None = None
    timezone: str | None = None
    lat: float | None = None
    lng: float | None = None
    public_phone: PhoneStr | None = None
    public_email: str | None = None
    public_hours_weekdays: str | None = None
    public_hours_weekends: str | None = None
    public_working_hours_enabled: bool | None = None
    public_working_hours: list[PublicWorkingHour] | None = None
    public_parking_notes: str | None = None
    public_transit_notes: str | None = None
    public_included_items: str | None = None
    booking_granularity: BookingGranularity | None = None
    status: LocationStatus | None = None
    amenity_ids: list[int] | None = None

    @field_validator("amenity_ids")
    @classmethod
    def dedupe_amenity_ids(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return None
        return list(dict.fromkeys(value))
