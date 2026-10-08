import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.db import SessionLocal
from app.realtime import events, presence
from app.realtime.manager import manager
from app.services.auth import user_from_token

router = APIRouter()

WS_UNAUTHORIZED = 4401


def _user_id_for(token: str | None) -> int | None:
    with SessionLocal() as db:
        user = user_from_token(db, token)
        return user.id if user else None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    user_id = await run_in_threadpool(_user_id_for, token)
    # Accept before closing: a close during the handshake reaches the browser as 1006, not 4401.
    await websocket.accept()
    if user_id is None:
        await websocket.close(code=WS_UNAUTHORIZED)
        return
    first_socket = manager.connect(user_id, websocket)
    try:
        await presence.on_connect(user_id, first_socket)
        await events.user_connected(user_id)
        while True:
            raw = await websocket.receive_text()
            try:
                envelope = json.loads(raw)
            except json.JSONDecodeError:
                envelope = None
            if not isinstance(envelope, dict) or not isinstance(envelope.get("type"), str):
                await websocket.send_json({"type": "error", "data": {"detail": "invalid envelope"}})
            elif envelope["type"] == "ping":
                await websocket.send_json({"type": "pong", "data": {}})
            elif envelope["type"] == "typing":
                await events.relay_typing(user_id, envelope.get("data"))
            else:
                # Kept for the /status connectivity page.
                await websocket.send_json({"type": "echo", "data": envelope})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id, websocket)
        presence.on_disconnect(user_id)
