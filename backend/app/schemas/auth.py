from pydantic import BaseModel, field_validator

from app.schemas.user import UserOut
from app.services.phone import normalize_phone


class RequestOtpIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def normalize(cls, value: str) -> str:
        return normalize_phone(value)


class VerifyIn(RequestOtpIn):
    otp: str


class AuthOut(BaseModel):
    token: str
    user: UserOut
    is_new: bool
