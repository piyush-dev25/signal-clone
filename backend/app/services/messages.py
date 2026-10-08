from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Message, User
from app.schemas.message import MessageOut, ReplyToOut
from app.services.errors import BadRequest
from app.services.membership import member_ids, require_member
from app.services.reactions import reactions_for


@dataclass
class SendResult:
    message: MessageOut
    created: bool  # False when (sender, client_id) already existed: an idempotent retry
    member_ids: set[int]


def to_message_out(db: Session, messages: Sequence[Message]) -> list[MessageOut]:
    """Serialize messages, loading every quoted message and all reactions in one query each."""
    reactions = reactions_for(db, [m.id for m in messages])
    reply_ids = {m.reply_to_id for m in messages if m.reply_to_id is not None}
    replies = (
        {r.id: r for r in db.scalars(select(Message).where(Message.id.in_(reply_ids)))} if reply_ids else {}
    )
    out = []
    for m in messages:
        quoted = replies.get(m.reply_to_id) if m.reply_to_id is not None else None
        out.append(
            MessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                sender_id=m.sender_id,
                type=m.type,
                body=m.body,
                meta=m.meta,
                reply_to=(
                    ReplyToOut(id=quoted.id, sender_id=quoted.sender_id, type=quoted.type, body=quoted.body)
                    if quoted
                    else None
                ),
                client_id=m.client_id,
                created_at=m.created_at,
                reactions=reactions.get(m.id, []),
            )
        )
    return out


def _existing(db: Session, sender_id: int, client_id: str) -> Message | None:
    return db.scalar(select(Message).where(Message.sender_id == sender_id, Message.client_id == client_id))


def send_message(
    db: Session, user: User, conversation_id: int, client_id: str, body: str, reply_to_id: int | None = None
) -> SendResult:
    """Save a text message. Retrying with the same client_id returns the original message."""
    require_member(db, user, conversation_id)
    members = member_ids(db, conversation_id)

    existing = _existing(db, user.id, client_id)
    if existing is not None:
        if existing.conversation_id != conversation_id:
            raise BadRequest("client_id was already used in another conversation")
        return SendResult(to_message_out(db, [existing])[0], created=False, member_ids=members)

    if reply_to_id is not None:
        quoted = db.get(Message, reply_to_id)
        if quoted is None or quoted.conversation_id != conversation_id or quoted.type != "text":
            raise BadRequest("You can only reply to a message in this conversation")

    message = Message(
        conversation_id=conversation_id,
        sender_id=user.id,
        type="text",
        body=body.strip(),
        reply_to_id=reply_to_id,
        client_id=client_id,
    )
    db.add(message)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent retry with the same client_id won the insert.
        db.rollback()
        existing = _existing(db, user.id, client_id)
        if existing is None:
            raise
        return SendResult(to_message_out(db, [existing])[0], created=False, member_ids=members)
    return SendResult(to_message_out(db, [message])[0], created=True, member_ids=members)


def list_messages(
    db: Session, user: User, conversation_id: int, before_id: int | None = None, limit: int = 30
) -> list[MessageOut]:
    """Newest first. Pass the oldest id you have as before_id to page backwards; ids are stable cursors."""
    require_member(db, user, conversation_id)
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_id is not None:
        query = query.where(Message.id < before_id)
    messages = db.scalars(query.order_by(Message.id.desc()).limit(limit)).all()
    return to_message_out(db, messages)
