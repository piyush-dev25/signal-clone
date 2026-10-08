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
from app.realtime.manager import manager
from app.schemas.message import MessageOut
from app.services import receipts
from app.services.messages import SendResult


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


def _deliver_all(user_id: int) -> list[receipts.ReceiptPush]:
    with SessionLocal() as db:
        return receipts.deliver_all(db, user_id)


async def user_connected(user_id: int) -> None:
    """A socket opened: everything already in the user's conversations is now delivered."""
    for members, update in await run_in_threadpool(_deliver_all, user_id):
        await push(members, "receipt_update", update)
