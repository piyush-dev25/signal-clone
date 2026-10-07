from datetime import datetime
from typing import Any

from pydantic import BaseModel


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
