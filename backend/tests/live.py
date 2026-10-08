"""Shared helpers for tests that use real (test) websockets via the live_client fixture."""

import pytest

from app.models import ConversationMember
from app.services.auth import FIXED_OTP


@pytest.fixture
def users(live_client):
    def make(phone, name):
        auth = live_client.post("/auth/verify", json={"phone": phone, "otp": FIXED_OTP}).json()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        live_client.put("/me", json={"display_name": name}, headers=headers)
        return {"id": auth["user"]["id"], "token": auth["token"], "headers": headers}

    return {
        "priya": make("+919876543210", "Priya"),
        "rahul": make("+919812345678", "Rahul"),
        "meera": make("+919900112233", "Meera"),
    }


def open_dm(client, a, b) -> int:
    return client.post("/conversations/direct", json={"user_id": b["id"]}, headers=a["headers"]).json()["id"]


def send(client, user, conversation_id, body="hi", client_id="c-1"):
    res = client.post(
        f"/conversations/{conversation_id}/messages",
        json={"client_id": client_id, "body": body},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    return res.json()


def connect(client, user):
    return client.websocket_connect(f"/ws?token={user['token']}")


def next_of(ws, type_):
    """Next event of a type, skipping others (e.g. receipt updates from connecting)."""
    for _ in range(10):
        event = ws.receive_json()
        if event["type"] == type_:
            return event["data"]
    raise AssertionError(f"no {type_} event")


def ping(ws):
    """Round-trip a ping: everything pushed before it has been received once the pong arrives."""
    ws.send_json({"type": "ping", "data": {}})
    events = []
    while (event := ws.receive_json())["type"] != "pong":
        events.append(event)
    return events


def cursors(db, conversation_id, user):
    db.expire_all()
    m = db.get(ConversationMember, (conversation_id, user["id"]))
    return m.last_delivered_message_id, m.last_read_message_id


def settle(*sockets):
    """Wait until every socket's connect-time work (presence, delivery receipts) is done and drained.

    Round 1: each pong proves that socket's own connect handling, and everything it pushed to the
    others, has happened. Round 2 drains whatever those pushes left in the other sockets."""
    for _ in range(2):
        for ws in sockets:
            ping(ws)
