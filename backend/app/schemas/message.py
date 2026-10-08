from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, StringConstraints


class ReplyToOut(BaseModel):
    id: int
    sender_id: int
    type: str
    body: str | None


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    type: str
    body: str | None
    meta: dict[str, Any] | None
    reply_to: ReplyToOut | None
    client_id: str | None
    created_at: datetime


class SendMessageIn(BaseModel):
    client_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]
    reply_to_id: int | None = None
