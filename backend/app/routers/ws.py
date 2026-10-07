import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db import SessionLocal
from app.services.auth import user_from_token

router = APIRouter()

WS_UNAUTHORIZED = 4401


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    with SessionLocal() as db:
        user = user_from_token(db, token)
    # Accept before closing: a close during the handshake reaches the browser as 1006, not 4401.
    await websocket.accept()
    if user is None:
        await websocket.close(code=WS_UNAUTHORIZED)
        return
    try:
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
            else:
                await websocket.send_json({"type": "echo", "data": envelope})
    except WebSocketDisconnect:
        pass
