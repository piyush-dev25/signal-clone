from tests.live import connect, cursors, next_of, open_dm, ping, send, settle, users  # noqa: F401  (users is a fixture)


def read(client, user, conversation_id, message_id):
    return client.post(f"/conversations/{conversation_id}/read", json={"message_id": message_id}, headers=user["headers"])


def unread(client, user, conversation_id):
    convs = client.get("/conversations", headers=user["headers"]).json()
    return next(c for c in convs if c["id"] == conversation_id)["unread_count"]


def test_read_moves_cursor_and_returns_it(live_client, users, db):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    first = send(live_client, priya, conv, client_id="a")
    second = send(live_client, priya, conv, client_id="b")
    assert unread(live_client, rahul, conv) == 2

    res = read(live_client, rahul, conv, first["id"])
    assert res.status_code == 200
    assert res.json() == {"conversation_id": conv, "last_read": first["id"], "last_delivered": first["id"]}
    assert unread(live_client, rahul, conv) == 1

    read(live_client, rahul, conv, second["id"])
    assert unread(live_client, rahul, conv) == 0
    assert cursors(db, conv, rahul) == (second["id"], second["id"])  # reading lifted delivered too


def test_read_is_clamped_to_latest_message(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    latest = send(live_client, priya, conv)
    res = read(live_client, rahul, conv, latest["id"] + 1000)
    assert res.json()["last_read"] == latest["id"]


def test_read_never_moves_backwards(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    first = send(live_client, priya, conv, client_id="a")
    second = send(live_client, priya, conv, client_id="b")
    read(live_client, rahul, conv, second["id"])
    res = read(live_client, rahul, conv, first["id"])
    assert res.json()["last_read"] == second["id"]


def test_read_in_empty_conversation(live_client, users):
    conv = open_dm(live_client, users["priya"], users["rahul"])
    res = read(live_client, users["priya"], conv, 0)
    assert res.status_code == 200
    assert res.json() == {"conversation_id": conv, "last_read": 0, "last_delivered": 0}


def test_read_requires_membership(live_client, users):
    conv = open_dm(live_client, users["priya"], users["rahul"])
    assert read(live_client, users["meera"], conv, 1).status_code == 403
    assert read(live_client, users["priya"], 9999, 1).status_code == 404
    assert read(live_client, users["priya"], conv, -1).status_code == 422


def test_read_pushes_receipt_to_sender_and_readers_other_tabs(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    message = send(live_client, priya, conv)  # Rahul offline: not yet delivered
    with connect(live_client, priya) as p, connect(live_client, rahul) as rahul_tab2:
        settle(p, rahul_tab2)  # drop the connect-time delivery receipts
        read(live_client, rahul, conv, message["id"])
        expected = {"conversation_id": conv, "user_id": rahul["id"], "read_up_to": message["id"]}
        assert next_of(p, "receipt_update") == expected
        assert next_of(rahul_tab2, "receipt_update") == expected


def test_read_that_moves_nothing_pushes_nothing(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    message = send(live_client, priya, conv)
    read(live_client, rahul, conv, message["id"])
    with connect(live_client, priya) as p:
        ping(p)
        read(live_client, rahul, conv, message["id"])
        assert [e for e in ping(p) if e["type"] == "receipt_update"] == []


def test_read_lifts_delivered_in_the_push(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    message = send(live_client, priya, conv)  # Rahul never connected: delivered cursor is 0
    with connect(live_client, priya) as p:
        ping(p)
        read(live_client, rahul, conv, message["id"])
        assert next_of(p, "receipt_update") == {
            "conversation_id": conv,
            "user_id": rahul["id"],
            "read_up_to": message["id"],
            "delivered_up_to": message["id"],
        }
