from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Message
from app.schemas.message import MessageOut, ReplyToOut


def to_message_out(db: Session, messages: Sequence[Message]) -> list[MessageOut]:
    """Serialize messages, loading every quoted message in one query."""
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
            )
        )
    return out
