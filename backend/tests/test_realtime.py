"""Pushes over real (test) websockets. Uses live_client so REST and sockets share an event loop."""

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


def test_message_new_reaches_recipient_and_senders_other_tabs(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as tab1, connect(live_client, priya) as tab2, connect(live_client, rahul) as r:
        message = send(live_client, priya, conv, body="Movie tonight?")
        for ws in (r, tab1, tab2):
            pushed = next_of(ws, "message_new")
            assert pushed == message


def test_connected_recipient_gets_delivered_and_sender_is_told(live_client, users, db):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p, connect(live_client, rahul) as r:
        ping(r)  # make sure Rahul's socket is registered
        message = send(live_client, priya, conv)
        next_of(p, "message_new")
        receipt = next_of(p, "receipt_update")
        assert receipt == {"conversation_id": conv, "user_id": rahul["id"], "delivered_up_to": message["id"]}
        assert next_of(r, "receipt_update") == receipt  # every member hears about it
    assert cursors(db, conv, rahul) == (message["id"], 0)  # delivered, not read


def test_offline_recipient_is_not_marked_delivered(live_client, users, db):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p:
        send(live_client, priya, conv)
        next_of(p, "message_new")
        assert all(e["type"] != "receipt_update" for e in ping(p))
    assert cursors(db, conv, rahul) == (0, 0)


def test_connecting_marks_backlog_delivered_and_notifies_members(live_client, users, db):
    priya, rahul, meera = users["priya"], users["rahul"], users["meera"]
    with_rahul = open_dm(live_client, priya, rahul)
    with_meera = open_dm(live_client, priya, meera)
    send(live_client, priya, with_rahul, client_id="a")
    latest = send(live_client, priya, with_rahul, client_id="b")
    send(live_client, priya, with_meera, client_id="c")  # not Rahul's conversation

    with connect(live_client, priya) as p:
        ping(p)
        with connect(live_client, rahul) as r:
            ping(r)
            receipt = next_of(p, "receipt_update")
            assert receipt == {"conversation_id": with_rahul, "user_id": rahul["id"], "delivered_up_to": latest["id"]}
            assert all(e["type"] != "receipt_update" for e in ping(p))  # nothing about Meera's chat
    assert cursors(db, with_rahul, rahul) == (latest["id"], 0)
    assert cursors(db, with_meera, meera) == (0, 0)


def test_reconnecting_with_nothing_new_sends_no_receipts(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    send(live_client, priya, conv)
    with connect(live_client, rahul) as r:
        ping(r)
    with connect(live_client, priya) as p:
        ping(p)
        with connect(live_client, rahul) as r:
            ping(r)
            assert all(e["type"] != "receipt_update" for e in ping(p))


def test_idempotent_retry_is_not_pushed_again(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, rahul) as r:
        ping(r)
        first = send(live_client, priya, conv, client_id="retry-me")
        assert next_of(r, "message_new")["id"] == first["id"]
        assert send(live_client, priya, conv, client_id="retry-me") == first
        assert all(e["type"] != "message_new" for e in ping(r))


def test_non_members_receive_nothing(live_client, users):
    priya, rahul, meera = users["priya"], users["rahul"], users["meera"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, meera) as m:
        ping(m)
        send(live_client, priya, conv)
        assert ping(m) == []
