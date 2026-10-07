from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_cors_preflight_allows_configured_origin():
    res = client.options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_cors_rejects_unknown_origin():
    res = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_ws_ping_pong():
    with client.websocket_connect("/ws?token=test") as ws:
        ws.send_json({"type": "ping", "data": {}})
        assert ws.receive_json() == {"type": "pong", "data": {}}


def test_ws_echo():
    with client.websocket_connect("/ws?token=test") as ws:
        envelope = {"type": "message", "data": {"text": "hello"}}
        ws.send_json(envelope)
        assert ws.receive_json() == {"type": "echo", "data": envelope}


def test_ws_invalid_envelope_keeps_socket_open():
    with client.websocket_connect("/ws") as ws:
        ws.send_text("not json")
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "ping", "data": {}})
        assert ws.receive_json()["type"] == "pong"
