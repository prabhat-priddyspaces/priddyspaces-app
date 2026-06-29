from typing import Literal

from pydantic import BaseModel, ConfigDict

ThemeFamily = Literal["neutral", "warm", "premium"]
ThemeMode = Literal["light", "dark", "system"]


class UserPreferenceOut(BaseModel):
    theme_family: ThemeFamily
    theme_mode: ThemeMode

    model_config = ConfigDict(from_attributes=True)


class UserPreferenceUpdate(BaseModel):
    theme_family: ThemeFamily | None = None
    theme_mode: ThemeMode | None = None
