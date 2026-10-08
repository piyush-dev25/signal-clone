"""Group conversations: create, rename, members, roles, leave. All rules live here.

Every change writes system messages (type='system', body=None, sender=actor, structured meta) and
returns a GroupChange describing what realtime/events.py must push.
"""

from collections.abc import Iterable
from dataclasses import dataclass, field

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Conversation, ConversationMember, Message, User
from app.schemas.message import MessageOut
from app.services.errors import BadRequest, NotFound, ServiceError
from app.services.membership import NotAMember, member_ids
from app.services.messages import to_message_out


class NotAdmin(ServiceError):
    status_code = 403
    detail = "Only admins can do that"


@dataclass
class GroupChange:
    conversation_id: int
    member_ids: set[int] = field(default_factory=set)  # members after the change
    messages: list[MessageOut] = field(default_factory=list)  # new system messages, oldest first
    removed: set[int] = field(default_factory=set)  # users who just lost access
    deleted: bool = False

    @property
    def is_noop(self) -> bool:
        return not self.messages and not self.removed and not self.deleted


def _load_group(db: Session, conversation_id: int) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise NotFound("Conversation not found")
    if conversation.type != "group":
        raise BadRequest("This isn't a group")
    return conversation


def _membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember | None:
    return db.get(ConversationMember, (conversation_id, user_id))


def _require_member(db: Session, conversation_id: int, user: User) -> ConversationMember:
    member = _membership(db, conversation_id, user.id)
    if member is None:
        raise NotAMember()
    return member


def _require_admin(db: Session, conversation_id: int, user: User) -> ConversationMember:
    member = _require_member(db, conversation_id, user)
    if member.role != "admin":
        raise NotAdmin()
    return member


def _users(db: Session, user_ids: Iterable[int]) -> dict[int, User]:
    ids = set(user_ids)
    found = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    if len(found) != len(ids):
        raise BadRequest("Some of those people aren't on Signal")
    return found


def _system(db: Session, conversation_id: int, actor: User, action: str, target: User | None = None, **extra) -> Message:
    """Add a system message. Names are snapshotted so the text still reads right after someone leaves."""
    meta = {"action": action, "actor_id": actor.id, "actor_name": actor.display_name, **extra}
    if target is not None:
        meta |= {"target_id": target.id, "target_name": target.display_name}
    message = Message(conversation_id=conversation_id, sender_id=actor.id, type="system", body=None, meta=meta)
    db.add(message)
    db.flush()
    return message


def _finish(db: Session, conversation_id: int, messages: list[Message], removed: set[int] | None = None) -> GroupChange:
    db.commit()
    return GroupChange(
        conversation_id=conversation_id,
        member_ids=member_ids(db, conversation_id),
        messages=to_message_out(db, messages),
        removed=removed or set(),
    )


def _latest_id(db: Session, conversation_id: int) -> int:
    return db.scalar(select(func.max(Message.id)).where(Message.conversation_id == conversation_id)) or 0


def create_group(db: Session, creator: User, name: str, member_ids_: list[int]) -> GroupChange:
    if creator.id in member_ids_:
        raise BadRequest("Don't include yourself; you're added as the admin")
    others = _users(db, member_ids_)
    conversation = Conversation(type="group", name=name, created_by=creator.id)
    db.add(conversation)
    db.flush()
    db.add(ConversationMember(conversation_id=conversation.id, user_id=creator.id, role="admin"))
    db.add_all(ConversationMember(conversation_id=conversation.id, user_id=uid, role="member") for uid in others)
    message = _system(db, conversation.id, creator, "group_created", name=name)
    return _finish(db, conversation.id, [message])


def rename(db: Session, actor: User, conversation_id: int, name: str) -> GroupChange:
    conversation = _load_group(db, conversation_id)
    _require_admin(db, conversation_id, actor)
    if conversation.name == name:
        return GroupChange(conversation_id)
    conversation.name = name
    message = _system(db, conversation_id, actor, "renamed", name=name)
    return _finish(db, conversation_id, [message])


def add_members(db: Session, actor: User, conversation_id: int, user_ids: list[int]) -> GroupChange:
    _load_group(db, conversation_id)
    _require_admin(db, conversation_id, actor)
    users = _users(db, user_ids)
    current = member_ids(db, conversation_id)
    new = [users[uid] for uid in user_ids if uid not in current]
    if not new:
        return GroupChange(conversation_id)
    # New members see the history, but none of it is unread or "pending delivery" for them.
    latest = _latest_id(db, conversation_id)
    db.add_all(
        ConversationMember(
            conversation_id=conversation_id,
            user_id=user.id,
            role="member",
            last_delivered_message_id=latest,
            last_read_message_id=latest,
        )
        for user in new
    )
    messages = [_system(db, conversation_id, actor, "member_added", user) for user in new]
    return _finish(db, conversation_id, messages)


def remove_member(db: Session, actor: User, conversation_id: int, user_id: int) -> GroupChange:
    _load_group(db, conversation_id)
    _require_admin(db, conversation_id, actor)
    if user_id == actor.id:
        raise BadRequest("Use Leave group to leave")
    member = _membership(db, conversation_id, user_id)
    if member is None:
        raise NotFound("They're not in this group")
    target = db.get(User, user_id)
    message = _system(db, conversation_id, actor, "member_removed", target)
    db.delete(member)
    return _finish(db, conversation_id, [message], removed={user_id})


def _admin_count(db: Session, conversation_id: int) -> int:
    return db.scalar(
        select(func.count()).where(
            ConversationMember.conversation_id == conversation_id, ConversationMember.role == "admin"
        )
    )


def change_role(db: Session, actor: User, conversation_id: int, user_id: int, role: str) -> GroupChange:
    _load_group(db, conversation_id)
    _require_admin(db, conversation_id, actor)
    member = _membership(db, conversation_id, user_id)
    if member is None:
        raise NotFound("They're not in this group")
    if member.role == role:
        return GroupChange(conversation_id)
    if member.role == "admin" and _admin_count(db, conversation_id) == 1:
        raise BadRequest("A group needs at least one admin")
    member.role = role
    message = _system(db, conversation_id, actor, "role_changed", db.get(User, user_id), role=role)
    return _finish(db, conversation_id, [message])


def leave(db: Session, user: User, conversation_id: int) -> GroupChange:
    _load_group(db, conversation_id)
    member = _require_member(db, conversation_id, user)
    messages = [_system(db, conversation_id, user, "member_left")]
    db.delete(member)
    db.flush()

    remaining = db.scalars(
        select(ConversationMember)
        .where(ConversationMember.conversation_id == conversation_id)
        .order_by(ConversationMember.joined_at, ConversationMember.user_id)
    ).all()
    if not remaining:
        # Last one out: the group and its history go (messages cascade).
        db.execute(delete(Conversation).where(Conversation.id == conversation_id))
        db.commit()
        return GroupChange(conversation_id, removed={user.id}, deleted=True)

    if not any(m.role == "admin" for m in remaining):
        # Never leave a group without an admin: the longest-standing member takes over.
        successor = remaining[0]
        successor.role = "admin"
        promoted = db.get(User, successor.user_id)
        # actor == target marks an automatic promotion ("Rahul is now an admin").
        messages.append(_system(db, conversation_id, promoted, "role_changed", promoted, role="admin"))
    return _finish(db, conversation_id, messages, removed={user.id})
