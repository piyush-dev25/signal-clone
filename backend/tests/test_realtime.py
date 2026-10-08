"""Pushes over real (test) websockets. Uses live_client so REST and sockets share an event loop."""

from tests.live import connect, cursors, next_of, open_dm, ping, send, users  # noqa: F401  (users is a fixture)


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
