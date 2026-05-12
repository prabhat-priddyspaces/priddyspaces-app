from pydantic import BaseModel, ConfigDict, Field

from app.schemas.working_hours import PublicWorkingHour


class MarketplaceSpaceOut(BaseModel):
    space_public_id: str
    space_type: str
    capacity: int
    price_daily: int | None
    price_monthly: int | None
    availability_status: str
    availability_start_time: str | None = None
    availability_end_time: str | None = None
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    location_public_id: str
    location_name: str
    location_address: str
    location_city: str | None
    location_timezone: str
    amenities: str | None = None
    image_url: str | None = None
    distance_km: float | None = None

    model_config = ConfigDict(from_attributes=True)


class MarketplaceLocationSearchMetaOut(BaseModel):
    total_locations: int
    page: int
    page_size: int


class MarketplaceLocationSummaryOut(BaseModel):
    location_public_id: str
    name: str
    address: str
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None
    neighborhood: str | None = None
    timezone: str
    lat: float | None = None
    lng: float | None = None
    featured_image_url: str | None = None
    location_amenities: list[str]
    matching_space_count: int
    featured_space_public_id: str | None = None
    starting_day_pass_price: int | None = None
    starting_monthly_price: int | None = None
    starting_hourly_price: int | None = None
    starting_membership_price: int | None = None
    distance_miles: float | None = None
    public_working_hours_enabled: bool = False
    public_working_hours: list[PublicWorkingHour] = Field(default_factory=list)


class MarketplaceLocationSearchOut(BaseModel):
    meta: MarketplaceLocationSearchMetaOut
    results: list[MarketplaceLocationSummaryOut]


class MarketplaceLocationSpaceOut(BaseModel):
    public_id: str
    name: str
    space_type: str
    capacity: int
    availability_status: str
    availability_start_time: str | None = None
    availability_end_time: str | None = None
    price_daily: int | None = None
    price_monthly: int | None = None
    hourly_price: int | None = None
    membership_price: int | None = None
    amenities: list[str]
    image_url: str | None = None


class MarketplaceLocationDetailOut(MarketplaceLocationSummaryOut):
    spaces: list[MarketplaceLocationSpaceOut]


class MarketplaceSpaceImageOut(BaseModel):
    public_id: str
    image_url: str
    is_primary: bool
    sort_order: int


class MarketplaceVolumeDiscountTierOut(BaseModel):
    min_hours: float
    discount_percent: int


class MarketplaceSpaceDetailSpaceOut(BaseModel):
    public_id: str
    name: str
    space_type: str
    capacity: int
    availability_status: str
    availability_start_time: str | None = None
    availability_end_time: str | None = None
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    price_daily: int | None = None
    price_monthly: int | None = None
    hourly_price: int | None = None
    membership_price: int | None = None
    amenities: list[str]
    volume_discounts: list[MarketplaceVolumeDiscountTierOut] = []


class MarketplaceSpaceDetailLocationOut(BaseModel):
    location_public_id: str
    name: str
    address: str
    city: str | None = None
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
    public_parking_notes: list[str]
    public_transit_notes: list[str]
    public_included_items: list[str]


class MarketplaceCancellationPolicyOut(BaseModel):
    cancel_window_hours: int
    refund_percent: int
    tiers: list[dict] = []


class MarketplaceSupportContactOut(BaseModel):
    name: str
    title: str


class MarketplaceSpaceDetailOut(BaseModel):
    space: MarketplaceSpaceDetailSpaceOut
    images: list[MarketplaceSpaceImageOut]
    location: MarketplaceSpaceDetailLocationOut
    cancellation_policy: MarketplaceCancellationPolicyOut | None = None
    support_contacts: list[MarketplaceSupportContactOut]


class SpaceAvailabilityIntervalOut(BaseModel):
    start: str
    end: str


class SpaceAvailabilityDayOut(BaseModel):
    date: str
    fully_blocked: bool
    busy_intervals: list[SpaceAvailabilityIntervalOut]


class SpaceAvailabilityOut(BaseModel):
    space_public_id: str
    timezone: str
    granularity_minutes: int | None
    availability_start_time: str | None
    availability_end_time: str | None
    buffer_before_minutes: int = 0
    buffer_after_minutes: int = 0
    hourly_price: int | None
    daily_price: int | None
    days: list[SpaceAvailabilityDayOut]
