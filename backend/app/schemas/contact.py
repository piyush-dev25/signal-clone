from datetime import datetime

from pydantic import BaseModel, field_validator

from app.services.phone import normalize_phone


class ContactOut(BaseModel):
    id: int
    user_id: int
    phone: str
    display_name: str
    avatar: str | None
    nickname: str | None
    last_seen: datetime | None


class AddContactIn(BaseModel):
    phone: str
    nickname: str | None = None

    @field_validator("phone")
    @classmethod
    def normalize(cls, value: str) -> str:
        return normalize_phone(value)

    @field_validator("nickname")
    @classmethod
    def clean_nickname(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) > 50:
            raise ValueError("Nickname must be at most 50 characters")
        return value or None
