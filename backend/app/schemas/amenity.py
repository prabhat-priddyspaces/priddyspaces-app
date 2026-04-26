from pydantic import BaseModel, ConfigDict, Field, field_validator


class AmenityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Amenity name is required")
        if len(cleaned) > 100:
            raise ValueError("Amenity name must be 100 characters or fewer")
        return cleaned


class AmenityUpdate(AmenityCreate):
    pass


class AmenityOut(BaseModel):
    id: int
    name: str
    slug: str | None = None

    model_config = ConfigDict(from_attributes=True)
