from pydantic import BaseModel, ConfigDict


class FloorPlanPresignIn(BaseModel):
    filename: str


class FloorPlanPresignOut(BaseModel):
    upload_url: str
    key: str


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
