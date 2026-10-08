"""Emoji reactions: one per user per message (the table's primary key enforces it).

Reactions never touch unread counts, receipt cursors, the last-message preview or conversation
ordering. A member who leaves keeps their reactions in history.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Message, MessageReaction, User
from app.schemas.message import ReactionOut
from app.services.errors import BadRequest, NotFound
from app.services.membership import member_ids, require_member

# The only backend copy; must match REACTIONS in frontend/src/lib/reactions.ts.
ALLOWED_REACTIONS = ("❤️", "👍", "👎", "😂", "😮", "😢")


@dataclass
class ReactionResult:
    conversation_id: int
    message_id: int
    reactions: list[ReactionOut]  # the message's full current list (a snapshot)
    member_ids: set[int]
    changed: bool  # False for no-ops (same emoji again, removing nothing)


def reactions_for(db: Session, message_ids: Iterable[int]) -> dict[int, list[ReactionOut]]:
    """Reactions for many messages in one query, each list in the order people reacted."""
    ids = set(message_ids)
    grouped: dict[int, list[ReactionOut]] = defaultdict(list)
    if not ids:
        return grouped
    rows = db.scalars(
        select(MessageReaction)
        .where(MessageReaction.message_id.in_(ids))
        .order_by(MessageReaction.created_at, MessageReaction.user_id)
    )
    for reaction in rows:
        grouped[reaction.message_id].append(ReactionOut(user_id=reaction.user_id, emoji=reaction.emoji))
    return grouped


def _reactable(db: Session, user: User, message_id: int) -> Message:
    message = db.get(Message, message_id)
    if message is None:
        raise NotFound("Message not found")
    require_member(db, user, message.conversation_id)  # 403 if not in the conversation
    if message.type != "text":
        raise BadRequest("You can only react to messages")
    return message


def _result(db: Session, message: Message, changed: bool) -> ReactionResult:
    return ReactionResult(
        conversation_id=message.conversation_id,
        message_id=message.id,
        reactions=reactions_for(db, [message.id])[message.id],
        member_ids=member_ids(db, message.conversation_id),
        changed=changed,
    )


def set_reaction(db: Session, user: User, message_id: int, emoji: str) -> ReactionResult:
    """React with `emoji`, replacing a different earlier reaction. Same emoji again is a no-op."""
    message = _reactable(db, user, message_id)
    existing = db.get(MessageReaction, (message_id, user.id))
    if existing is not None and existing.emoji == emoji:
        return _result(db, message, changed=False)
    if existing is None:
        db.add(MessageReaction(message_id=message_id, user_id=user.id, emoji=emoji))
    else:
        existing.emoji = emoji
        existing.created_at = utcnow()  # the list is ordered by when people (last) reacted
    db.commit()
    return _result(db, message, changed=True)


def remove_reaction(db: Session, user: User, message_id: int) -> ReactionResult:
    """Remove my reaction; removing when there is none is a no-op."""
    message = _reactable(db, user, message_id)
    existing = db.get(MessageReaction, (message_id, user.id))
    if existing is None:
        return _result(db, message, changed=False)
    db.delete(existing)
    db.commit()
    return _result(db, message, changed=True)
