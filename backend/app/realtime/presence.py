"""Online / last seen.

Online means "has at least one open socket". When the last socket closes we wait a grace period
before announcing offline, so a refresh or a quick reconnect never shows a flicker. Presence is
sent to everyone who shares a conversation with the user (only connected ones receive it).
"""

import asyncio
from datetime import datetime

from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.db import SessionLocal, utcnow
from app.models import User
from app.realtime.events import push
from app.realtime.manager import manager
from app.services.membership import contacts_of

_pending_offline: dict[int, asyncio.Task] = {}


def _audience_and_last_seen(user_id: int) -> tuple[set[int], datetime | None]:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        return contacts_of(db, user_id), user.last_seen if user else None


def _record_last_seen(user_id: int) -> tuple[set[int], datetime]:
    now = utcnow()
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is not None:
            user.last_seen = now
            db.commit()
        return contacts_of(db, user_id), now


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat().replace("+00:00", "Z") if moment else None


async def _broadcast(audience: set[int], user_id: int, online: bool, last_seen: datetime | None) -> None:
    await push(audience, "presence", {"user_id": user_id, "online": online, "last_seen": _iso(last_seen)})


async def on_connect(user_id: int, first_socket: bool) -> None:
    pending = _pending_offline.pop(user_id, None)
    if pending is not None:
        # Back within the grace period: they were never announced offline, so announce nothing.
        pending.cancel()
        return
    if first_socket:
        audience, last_seen = await run_in_threadpool(_audience_and_last_seen, user_id)
        await _broadcast(audience, user_id, True, last_seen)


def on_disconnect(user_id: int) -> None:
    """Call after unregistering a socket. Schedules the offline announcement if none are left."""
    if manager.is_online(user_id) or user_id in _pending_offline:
        return
    _pending_offline[user_id] = asyncio.get_running_loop().create_task(_go_offline(user_id))


async def _go_offline(user_id: int) -> None:
    try:
        await asyncio.sleep(settings.presence_grace_seconds)
        if manager.is_online(user_id):
            return
        audience, last_seen = await run_in_threadpool(_record_last_seen, user_id)
        await _broadcast(audience, user_id, False, last_seen)
    finally:
        if _pending_offline.get(user_id) is asyncio.current_task():
            del _pending_offline[user_id]


def cancel_all() -> None:
    """Drop pending offline announcements (test teardown)."""
    for task in _pending_offline.values():
        task.cancel()
    _pending_offline.clear()
