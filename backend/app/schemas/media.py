from pydantic import BaseModel, ConfigDict, Field


class MediaPresignIn(BaseModel):
    filename: str
    content_type: str
    size_bytes: int = Field(gt=0, le=10 * 1024 * 1024)
    space_public_id: str


class MediaPresignOut(BaseModel):
    upload_url: str
    key: str
    public_url: str
    max_bytes: int


class SpaceImageCreate(BaseModel):
    space_public_id: str
    storage_key: str
    image_url: str | None = None
    is_primary: bool = False
    sort_order: int = 0


class SpaceImageUpdate(BaseModel):
    is_primary: bool | None = None
    sort_order: int | None = None


class SpaceImageOut(BaseModel):
    id: int
    public_id: str
    image_url: str
    storage_key: str
    is_primary: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)
