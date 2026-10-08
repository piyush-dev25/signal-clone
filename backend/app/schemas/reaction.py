from pydantic import BaseModel, field_validator

from app.services.reactions import ALLOWED_REACTIONS


class ReactionIn(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def allowed(cls, value: str) -> str:
        if value not in ALLOWED_REACTIONS:
            raise ValueError(f"emoji must be one of {' '.join(ALLOWED_REACTIONS)}")
        return value
