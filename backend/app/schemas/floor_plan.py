from pydantic import BaseModel, ConfigDict, Field


class FloorPlanPresignIn(BaseModel):
    filename: str
    content_type: str
    size_bytes: int = Field(gt=0, le=10 * 1024 * 1024)
    location_public_id: str


class FloorPlanPresignOut(BaseModel):
    upload_url: str
    key: str
    public_url: str | None = None
    max_bytes: int


class FloorPlanCreate(BaseModel):
    location_public_id: str
    image_url: str
    scale: str | None = None
    version: int | None = None


class FloorPlanOut(BaseModel):
    public_id: str
    image_url: str
    version: int
    model_config = ConfigDict(from_attributes=True)
