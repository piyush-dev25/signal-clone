"""Every WebSocket push goes through here.

Pattern: sync services do the DB work and return what must be pushed; the async functions below
send it. Sync REST handlers hand them to FastAPI BackgroundTasks, which run them on the event
loop (where the sockets live) right after the response is sent. The /ws route awaits them.
"""

from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.db import SessionLocal
from app.models import User
from app.realtime.manager import manager
from app.schemas.message import MessageOut
from app.services import receipts
from app.services.conversations import get_conversation_out
from app.services.groups import GroupChange
from app.services.membership import is_member, member_ids
from app.services.messages import SendResult
from app.services.reactions import ReactionResult


def envelope(type_: str, data: dict[str, Any]) -> dict[str, Any]:
    return {"type": type_, "data": data}


async def push(user_ids: set[int], type_: str, data: dict[str, Any]) -> None:
    await manager.send(user_ids, envelope(type_, data))


async def _push_message_new(member_ids: set[int], message: MessageOut, receipt_updates: list[dict]) -> None:
    await push(member_ids, "message_new", message.model_dump(mode="json"))
    for update in receipt_updates:
        await push(member_ids, "receipt_update", update)


def schedule_message_new(background: BackgroundTasks, db: Session, result: SendResult) -> None:
    """After a new message: mark it delivered to members who are connected right now, then push
    message_new to every member (the sender's other tabs included) and the receipt updates."""
    sender_id = result.message.sender_id
    online = manager.online(result.member_ids - {sender_id})
    updates = receipts.mark_delivered(db, result.message.conversation_id, result.message.id, online)
    background.add_task(_push_message_new, result.member_ids, result.message, updates)


def schedule_push(background: BackgroundTasks, user_ids: set[int], type_: str, data: dict[str, Any]) -> None:
    """Push one event after the response is sent (from a sync REST handler)."""
    background.add_task(push, user_ids, type_, data)


def _deliver_all(user_id: int) -> list[receipts.ReceiptPush]:
    with SessionLocal() as db:
        return receipts.deliver_all(db, user_id)


async def user_connected(user_id: int) -> None:
    """A socket opened: everything already in the user's conversations is now delivered."""
    for members, update in await run_in_threadpool(_deliver_all, user_id):
        await push(members, "receipt_update", update)


def _typing_audience(user_id: int, conversation_id: int) -> set[int] | None:
    with SessionLocal() as db:
        if not is_member(db, user_id, conversation_id):
            return None
        return member_ids(db, conversation_id) - {user_id}


async def relay_typing(user_id: int, data: Any) -> None:
    """Client typing event -> the conversation's other members. Never stored; non-members ignored."""
    if not isinstance(data, dict):
        return
    conversation_id, is_typing = data.get("conversation_id"), data.get("is_typing")
    if type(conversation_id) is not int or not isinstance(is_typing, bool):
        return
    audience = await run_in_threadpool(_typing_audience, user_id, conversation_id)
    if audience:
        await push(audience, "typing", {"conversation_id": conversation_id, "user_id": user_id, "is_typing": is_typing})


async def _push_group_change(change: GroupChange, snapshots: list[tuple[int, dict[str, Any]]]) -> None:
    # Order matters: members (including new ones) get the conversation before its messages,
    # so a new member's client already knows the chat when the system messages arrive.
    for user_id, conversation in snapshots:
        await push({user_id}, "conversation_updated", conversation)
    for message in change.messages:
        await push(change.member_ids, "message_new", message.model_dump(mode="json"))
    if change.removed:
        await push(change.removed, "conversation_removed", {"conversation_id": change.conversation_id})


def schedule_group_change(background: BackgroundTasks, db: Session, change: GroupChange) -> None:
    """After a group change: each current member gets the full conversation as *they* see it
    (their own nicknames), then the new system messages; anyone who lost access is told so."""
    if change.is_noop:
        return
    snapshots = []
    if not change.deleted:
        for user_id in sorted(change.member_ids):
            viewer = db.get(User, user_id)
            conversation = get_conversation_out(db, viewer, change.conversation_id)
            snapshots.append((user_id, conversation.model_dump(mode="json")))
    background.add_task(_push_group_change, change, snapshots)


def schedule_reaction_update(background: BackgroundTasks, result: ReactionResult) -> None:
    """A reaction changed: every member (the actor's other tabs included) gets the message's full
    current reaction list. No-ops push nothing."""
    if not result.changed:
        return
    data = {
        "conversation_id": result.conversation_id,
        "message_id": result.message_id,
        "reactions": [r.model_dump() for r in result.reactions],
    }
    background.add_task(push, result.member_ids, "reaction_update", data)
