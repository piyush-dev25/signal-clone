from datetime import datetime

from pydantic import BaseModel

from app.schemas.message import MessageOut


class MemberOut(BaseModel):
    user_id: int
    display_name: str
    avatar: str | None
    phone: str
    nickname: str | None  # the viewer's nickname for this member
    role: str
    online: bool
    last_seen: datetime | None
    last_delivered: int
    last_read: int


class ConversationOut(BaseModel):
    id: int
    type: str
    name: str | None
    avatar: str | None
    created_at: datetime
    unread_count: int
    last_message: MessageOut | None
    members: list[MemberOut]


class DirectIn(BaseModel):
    user_id: int
