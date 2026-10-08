"""Who is in which conversation. Shared by the message, receipt and realtime code."""

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from app.models import Conversation, ConversationMember, User
from app.services.errors import NotFound, ServiceError


class NotAMember(ServiceError):
    status_code = 403
    detail = "You're not a member of this conversation"


def require_member(db: Session, user: User, conversation_id: int) -> ConversationMember:
    """404 if the conversation doesn't exist, 403 if the user isn't in it."""
    if db.get(Conversation, conversation_id) is None:
        raise NotFound("Conversation not found")
    member = db.get(ConversationMember, (conversation_id, user.id))
    if member is None:
        raise NotAMember()
    return member


def is_member(db: Session, user_id: int, conversation_id: int) -> bool:
    return db.get(ConversationMember, (conversation_id, user_id)) is not None


def member_ids(db: Session, conversation_id: int) -> set[int]:
    return set(
        db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id))
    )


def contacts_of(db: Session, user_id: int) -> set[int]:
    """Everyone who shares at least one conversation with the user (the audience for their presence)."""
    mine = aliased(ConversationMember)
    other = aliased(ConversationMember)
    return set(
        db.scalars(
            select(other.user_id)
            .join(mine, mine.conversation_id == other.conversation_id)
            .where(mine.user_id == user_id, other.user_id != user_id)
            .distinct()
        )
    )
