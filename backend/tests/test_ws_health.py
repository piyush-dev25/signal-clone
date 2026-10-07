import pytest
from starlette.websockets import WebSocketDisconnect

from app.models import User
from app.routers.ws import WS_UNAUTHORIZED


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_cors_preflight_allows_configured_origin(client):
    res = client.options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_unknown_origin(client):
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_ws_ping_pong(client, login):
    with client.websocket_connect(f"/ws?token={login()['token']}") as ws:
        ws.send_json({"type": "ping", "data": {}})
        assert ws.receive_json() == {"type": "pong", "data": {}}


def test_ws_echo(client, login):
    with client.websocket_connect(f"/ws?token={login()['token']}") as ws:
        envelope = {"type": "message", "data": {"text": "hello"}}
        ws.send_json(envelope)
        assert ws.receive_json() == {"type": "echo", "data": envelope}


def test_ws_invalid_envelope_keeps_socket_open(client, login):
    with client.websocket_connect(f"/ws?token={login()['token']}") as ws:
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "ping", "data": {}})
        assert ws.receive_json()["type"] == "pong"


def _close_code(client, url: str) -> int:
    with client.websocket_connect(url) as ws:
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_json()
    return exc.value.code


@pytest.mark.parametrize("url", ["/ws", "/ws?token=", "/ws?token=not-a-jwt"])
def test_ws_bad_token_closes_4401(client, url):
    assert _close_code(client, url) == WS_UNAUTHORIZED


def test_ws_token_for_deleted_user_closes_4401(client, login, db):
    auth = login()
    db.delete(db.get(User, auth["user"]["id"]))
    db.commit()
    assert _close_code(client, f"/ws?token={auth['token']}") == WS_UNAUTHORIZED
