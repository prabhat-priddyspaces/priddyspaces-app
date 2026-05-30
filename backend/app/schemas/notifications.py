from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PushConfigOut(BaseModel):
    web_push_enabled: bool
    web_push_public_key: str | None = None
    expo_push_enabled: bool = True


class PushSubscriptionCreate(BaseModel):
    provider: Literal["web", "expo"]
    subscription: dict[str, Any] | None = None
    token: str | None = None
    user_agent: str | None = Field(default=None, max_length=512)
    device_name: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def validate_payload(self):
        if self.provider == "web":
            endpoint = (self.subscription or {}).get("endpoint")
            if not isinstance(endpoint, str) or not endpoint:
                raise ValueError("Web push subscription endpoint is required")
        if self.provider == "expo":
            if not self.token:
                raise ValueError("Expo push token is required")
        return self


class PushSubscriptionOut(BaseModel):
    public_id: str
    provider: str
    is_active: bool
    device_name: str | None = None
    last_used_at: datetime | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class UserNotificationOut(BaseModel):
    public_id: str
    audience: str
    reminder_type: str
    title: str
    body: str
    link_url: str | None = None
    is_read: bool
    read_at: datetime | None = None
    push_status: str
    push_error: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class NotificationListOut(BaseModel):
    results: list[UserNotificationOut]
    total: int
    unread_count: int
    page: int
    page_size: int


class NotificationPreferenceOut(BaseModel):
    booking_start_push_enabled: bool
    booking_end_push_enabled: bool

    model_config = ConfigDict(from_attributes=True)


class NotificationPreferenceUpdate(BaseModel):
    booking_start_push_enabled: bool | None = None
    booking_end_push_enabled: bool | None = None
