"""user_id -> open sockets, in memory.

Single process only: with several workers/instances each would hold a different slice of the
connections, and pushes would need a shared broker (e.g. Redis pub/sub). Render's free tier runs
one uvicorn process, which is the deployment this targets.
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: int, websocket: WebSocket) -> bool:
        """Register a socket. Returns True if it is the user's first open socket."""
        first = not self._sockets.get(user_id)
        self._sockets[user_id].add(websocket)
        return first

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self._sockets.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            del self._sockets[user_id]

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    def online(self, user_ids: Iterable[int]) -> set[int]:
        return {uid for uid in user_ids if self.is_online(uid)}

    def clear(self) -> None:
        self._sockets.clear()

    async def send(self, user_ids: Iterable[int], envelope: dict[str, Any]) -> None:
        """Send one envelope to every socket of the given users. Dead sockets are dropped."""
        targets = [(uid, ws) for uid in set(user_ids) for ws in list(self._sockets.get(uid, ()))]
        if not targets:
            return
        results = await asyncio.gather(*(ws.send_json(envelope) for _, ws in targets), return_exceptions=True)
        for (uid, ws), result in zip(targets, results):
            if isinstance(result, Exception):
                log.info("dropping socket for user %s after send failure: %r", uid, result)
                self.disconnect(uid, ws)


manager = ConnectionManager()
