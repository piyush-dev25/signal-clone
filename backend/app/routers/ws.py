import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None) -> None:
    # Phase 0: token is accepted but not validated; every envelope is echoed back.
    await websocket.accept()
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
