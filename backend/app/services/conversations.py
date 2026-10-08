from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import and_, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Conversation, ConversationMember, Message, User
from app.schemas.conversation import ConversationOut, MemberOut
from app.services.contacts import nicknames_for
from app.services.errors import BadRequest, NotFound
from app.services.messages import to_message_out


def direct_key(a: int, b: int) -> str:
    return f"{min(a, b)}:{max(a, b)}"


def _build(db: Session, viewer: User, conversations: Sequence[Conversation]) -> list[ConversationOut]:
    """Conversation objects for the viewer, using a fixed number of queries regardless of count."""
    if not conversations:
        return []
    ids = [c.id for c in conversations]

    # Latest message per conversation via the (conversation_id, id) index.
    latest_ids = dict(
        db.execute(
            select(Message.conversation_id, func.max(Message.id))
            .where(Message.conversation_id.in_(ids))
            .group_by(Message.conversation_id)
        ).all()
    )
    latest_messages = (
        db.scalars(select(Message).where(Message.id.in_(latest_ids.values()))).all() if latest_ids else []
    )
    latest = {m.conversation_id: m for m in to_message_out(db, latest_messages)}

    # Unread: after my read cursor, not mine, not system.
    mine = ConversationMember
    unread = dict(
        db.execute(
            select(Message.conversation_id, func.count(Message.id))
            .join(mine, and_(mine.conversation_id == Message.conversation_id, mine.user_id == viewer.id))
            .where(
                Message.conversation_id.in_(ids),
                Message.id > mine.last_read_message_id,
                Message.sender_id != viewer.id,
                Message.type == "text",
            )
            .group_by(Message.conversation_id)
        ).all()
    )

    nicknames = nicknames_for(db, viewer.id)
    members: dict[int, list[MemberOut]] = defaultdict(list)
    rows = db.execute(
        select(ConversationMember, User)
        .join(User, User.id == ConversationMember.user_id)
        .where(ConversationMember.conversation_id.in_(ids))
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    ).all()
    for member, user in rows:
        members[member.conversation_id].append(
            MemberOut(
                user_id=user.id,
                display_name=user.display_name,
                avatar=user.avatar,
                phone=user.phone,
                nickname=nicknames.get(user.id),
                role=member.role,
                online=False,  # real presence arrives in Phase 4
                last_seen=user.last_seen,
                last_delivered=member.last_delivered_message_id,
                last_read=member.last_read_message_id,
            )
        )

    return [
        ConversationOut(
            id=c.id,
            type=c.type,
            name=c.name,
            avatar=c.avatar,
            created_at=c.created_at,
            unread_count=unread.get(c.id, 0),
            last_message=latest.get(c.id),
            members=members[c.id],
        )
        for c in conversations
    ]


def _activity_key(conv: ConversationOut) -> tuple:
    """Latest message (ids are assigned in time order), else creation time for empty chats."""
    last = conv.last_message
    return (last.created_at if last else conv.created_at, last.id if last else 0)


def list_conversations(db: Session, viewer: User) -> list[ConversationOut]:
    conversations = db.scalars(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == viewer.id)
    ).all()
    built = _build(db, viewer, conversations)
    by_id = {c.id: c for c in conversations}
    visible = [
        c
        for c in built
        # An empty direct chat only shows up for whoever opened it, until the first message.
        if not (c.type == "direct" and c.last_message is None and by_id[c.id].created_by != viewer.id)
    ]
    return sorted(visible, key=_activity_key, reverse=True)


def get_conversation_out(db: Session, viewer: User, conversation_id: int) -> ConversationOut:
    conversation = db.scalar(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(Conversation.id == conversation_id, ConversationMember.user_id == viewer.id)
    )
    if conversation is None:
        raise NotFound("Conversation not found")
    return _build(db, viewer, [conversation])[0]


def get_or_create_direct(db: Session, viewer: User, other_user_id: int) -> Conversation:
    if other_user_id == viewer.id:
        raise BadRequest("You can't start a chat with yourself")
    if db.get(User, other_user_id) is None:
        raise NotFound("User not found")
    key = direct_key(viewer.id, other_user_id)
    existing = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if existing is not None:
        return existing
    conversation = Conversation(type="direct", created_by=viewer.id, direct_key=key)
    db.add(conversation)
    try:
        db.flush()
        db.add_all(
            [
                ConversationMember(conversation_id=conversation.id, user_id=viewer.id, role="member"),
                ConversationMember(conversation_id=conversation.id, user_id=other_user_id, role="member"),
            ]
        )
        db.commit()
    except IntegrityError:
        # Another request created the same pair first.
        db.rollback()
        return db.scalar(select(Conversation).where(Conversation.direct_key == key))
    return conversation
