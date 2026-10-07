from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator

from app.services.users import PRESET_AVATARS

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phone: str
    display_name: str
    avatar: str | None
    last_seen: datetime | None
    created_at: datetime


class UpdateMeIn(BaseModel):
    display_name: DisplayName | None = None
    avatar: str | None = None

    @field_validator("display_name")
    @classmethod
    def name_not_null(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("display_name cannot be null")
        return value

    @field_validator("avatar")
    @classmethod
    def avatar_is_preset(cls, value: str | None) -> str | None:
        # Data-URL uploads are a later upgrade; for now only presets or null (initials).
        if value is not None:
            prefix, _, key = value.partition(":")
            if prefix != "preset" or key not in PRESET_AVATARS:
                raise ValueError("avatar must be null or preset:<key>")
        return value
