"""Delivered/read cursors. They only ever move forward; reading implies delivery."""

from collections.abc import Iterable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ConversationMember, Message, User
from app.services.membership import member_ids, require_member

# (member ids of the conversation, receipt_update payload)
ReceiptPush = tuple[set[int], dict]


def advance(
    member: ConversationMember, delivered_up_to: int | None = None, read_up_to: int | None = None
) -> dict | None:
    """Move a member's cursors forward. Returns the receipt_update payload, or None if nothing moved.

    The caller commits.
    """
    payload: dict = {"conversation_id": member.conversation_id, "user_id": member.user_id}
    if read_up_to is not None and read_up_to > member.last_read_message_id:
        member.last_read_message_id = read_up_to
        payload["read_up_to"] = read_up_to
        delivered_up_to = max(delivered_up_to or 0, read_up_to)
    if delivered_up_to is not None and delivered_up_to > member.last_delivered_message_id:
        member.last_delivered_message_id = delivered_up_to
        payload["delivered_up_to"] = delivered_up_to
    return payload if len(payload) > 2 else None


def mark_delivered(db: Session, conversation_id: int, message_id: int, user_ids: Iterable[int]) -> list[dict]:
    """Mark a message delivered to these members (e.g. the ones whose sockets are open)."""
    user_ids = list(user_ids)
    if not user_ids:
        return []
    members = db.scalars(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id, ConversationMember.user_id.in_(user_ids)
        )
    ).all()
    updates = [u for m in members if (u := advance(m, delivered_up_to=message_id))]
    db.commit()
    return updates


def deliver_all(db: Session, user_id: int) -> list[ReceiptPush]:
    """On connect: everything already sent to the user's conversations has now reached them."""
    latest = (
        select(Message.conversation_id, func.max(Message.id).label("latest_id"))
        .group_by(Message.conversation_id)
        .subquery()
    )
    rows = db.execute(
        select(ConversationMember, latest.c.latest_id)
        .join(latest, latest.c.conversation_id == ConversationMember.conversation_id)
        .where(
            ConversationMember.user_id == user_id,
            ConversationMember.last_delivered_message_id < latest.c.latest_id,
        )
    ).all()
    updates = [u for member, latest_id in rows if (u := advance(member, delivered_up_to=latest_id))]
    db.commit()
    return [(member_ids(db, u["conversation_id"]), u) for u in updates]


@dataclass
class ReadResult:
    update: dict | None  # receipt_update payload, None when no cursor moved
    member_ids: set[int]
    last_read: int
    last_delivered: int


def mark_read(db: Session, user: User, conversation_id: int, message_id: int) -> ReadResult:
    """Move the reader's read cursor up to message_id (clamped to the conversation's latest
    message). Forward only; reading also counts as delivery."""
    member = require_member(db, user, conversation_id)
    latest = db.scalar(select(func.max(Message.id)).where(Message.conversation_id == conversation_id)) or 0
    update = advance(member, read_up_to=min(message_id, latest))
    db.commit()
    return ReadResult(
        update=update,
        member_ids=member_ids(db, conversation_id),
        last_read=member.last_read_message_id,
        last_delivered=member.last_delivered_message_id,
    )
