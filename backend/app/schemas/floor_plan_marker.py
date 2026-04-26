from pydantic import BaseModel, ConfigDict


class FloorPlanMarkerCreate(BaseModel):
    floor_plan_public_id: str
    space_public_id: str
    x_coordinate: float
    y_coordinate: float
    width: float
    height: float


class FloorPlanMarkerOut(BaseModel):
    public_id: str
    space_id: int
    x_coordinate: float
    y_coordinate: float
    width: float
    height: float

    model_config = ConfigDict(from_attributes=True)
