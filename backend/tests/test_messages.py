import pytest
from sqlalchemy import func, select

from app.models import Message


@pytest.fixture
def priya(register):
    return register("+919876543210", "Priya Sharma")


@pytest.fixture
def rahul(register):
    return register("+919812345678", "Rahul Verma")


@pytest.fixture
def outsider(register):
    return register("+919731234567", "Arjun Mehta")


@pytest.fixture
def dm(client, priya, rahul) -> int:
    res = client.post("/conversations/direct", json={"user_id": rahul["id"]}, headers=priya["headers"])
    return res.json()["id"]


def send(client, user, conversation_id, body="hello", client_id="c-1", reply_to_id=None):
    payload = {"client_id": client_id, "body": body}
    if reply_to_id is not None:
        payload["reply_to_id"] = reply_to_id
    return client.post(f"/conversations/{conversation_id}/messages", json=payload, headers=user["headers"])


def page(client, user, conversation_id, **params):
    res = client.get(f"/conversations/{conversation_id}/messages", params=params, headers=user["headers"])
    assert res.status_code == 200, res.text
    return [m["id"] for m in res.json()]


# --- send --------------------------------------------------------------------


def test_send_returns_the_saved_message(client, priya, dm):
    res = send(client, priya, dm, body="  Hi Rahul!  ")
    assert res.status_code == 200
    message = res.json()
    assert message["conversation_id"] == dm
    assert message["sender_id"] == priya["id"]
    assert message["type"] == "text"
    assert message["body"] == "Hi Rahul!"  # trimmed
    assert message["client_id"] == "c-1"
    assert message["reply_to"] is None and message["meta"] is None
    assert message["created_at"].endswith("Z")


def test_same_client_id_is_idempotent(client, db, priya, dm):
    first = send(client, priya, dm, body="once").json()
    retry = send(client, priya, dm, body="once").json()
    assert retry == first
    assert db.scalar(select(func.count()).select_from(Message)) == 1


def test_client_id_is_scoped_to_the_sender(client, priya, rahul, dm):
    a = send(client, priya, dm, client_id="same").json()
    b = send(client, rahul, dm, client_id="same").json()
    assert a["id"] != b["id"]


def test_reusing_a_client_id_in_another_conversation_is_400(client, priya, rahul, register, dm):
    meera = register("+919900112233", "Meera Nair")
    other = client.post("/conversations/direct", json={"user_id": meera["id"]}, headers=priya["headers"]).json()
    send(client, priya, dm, client_id="dup")
    assert send(client, priya, other["id"], client_id="dup").status_code == 400


def test_non_member_cannot_send_or_read(client, outsider, dm):
    assert send(client, outsider, dm).status_code == 403
    res = client.get(f"/conversations/{dm}/messages", headers=outsider["headers"])
    assert res.status_code == 403


def test_unknown_conversation_is_404(client, priya):
    assert send(client, priya, 9999).status_code == 404


@pytest.mark.parametrize("body", ["", "   ", "x" * 4001])
def test_invalid_body_is_422(client, priya, dm, body):
    assert send(client, priya, dm, body=body).status_code == 422


def test_body_of_4000_chars_is_allowed(client, priya, dm):
    assert send(client, priya, dm, body="x" * 4000).status_code == 200


def test_missing_client_id_is_422(client, priya, dm):
    res = client.post(f"/conversations/{dm}/messages", json={"body": "hi"}, headers=priya["headers"])
    assert res.status_code == 422


def test_send_requires_auth(client, dm):
    assert client.post(f"/conversations/{dm}/messages", json={"client_id": "x", "body": "hi"}).status_code == 401


# --- replies -----------------------------------------------------------------


def test_reply_in_same_conversation(client, priya, rahul, dm):
    question = send(client, rahul, dm, body="Deadline Friday?", client_id="q").json()
    answer = send(client, priya, dm, body="Wednesday", client_id="a", reply_to_id=question["id"])
    assert answer.status_code == 200
    assert answer.json()["reply_to"] == {
        "id": question["id"],
        "sender_id": rahul["id"],
        "type": "text",
        "body": "Deadline Friday?",
    }


def test_reply_to_other_conversation_or_missing_message_is_400(client, priya, register, dm):
    meera = register("+919900112233", "Meera Nair")
    other = client.post("/conversations/direct", json={"user_id": meera["id"]}, headers=priya["headers"]).json()
    elsewhere = send(client, priya, other["id"], client_id="elsewhere").json()
    assert send(client, priya, dm, client_id="r1", reply_to_id=elsewhere["id"]).status_code == 400
    assert send(client, priya, dm, client_id="r2", reply_to_id=424242).status_code == 400


def test_reply_to_system_message_is_400(client, priya, rahul, make_group, add_message):
    group = make_group("Trek", [priya["id"], rahul["id"]])
    system = add_message(group, priya["id"], system=True)
    assert send(client, rahul, group, reply_to_id=system.id).status_code == 400


# --- history -----------------------------------------------------------------


def test_cursor_pagination_newest_first_and_stable(client, priya, rahul, dm, add_message):
    ids = [add_message(dm, priya["id"] if i % 2 else rahul["id"], f"m{i}").id for i in range(70)]

    first = page(client, priya, dm)
    assert first == ids[::-1][:30]  # default limit 30, newest first

    # New messages arriving between page loads must not shift older pages.
    add_message(dm, rahul["id"], "new 1")
    add_message(dm, rahul["id"], "new 2")

    second = page(client, priya, dm, before_id=first[-1])
    assert second == ids[::-1][30:60]
    third = page(client, priya, dm, before_id=second[-1])
    assert third == ids[::-1][60:]
    assert len(third) == 10
    assert page(client, priya, dm, before_id=third[-1]) == []


def test_custom_limit_and_bounds(client, priya, dm, add_message):
    for i in range(5):
        add_message(dm, priya["id"], f"m{i}")
    assert len(page(client, priya, dm, limit=2)) == 2
    assert len(page(client, priya, dm, limit=100)) == 5
    for bad in (0, 101):
        res = client.get(f"/conversations/{dm}/messages", params={"limit": bad}, headers=priya["headers"])
        assert res.status_code == 422


def test_history_includes_reply_and_system_messages(client, priya, rahul, make_group, add_message):
    group = make_group("Trek", [priya["id"], rahul["id"]])
    add_message(group, priya["id"], system=True)
    question = add_message(group, rahul["id"], "When?")
    add_message(group, priya["id"], "Saturday", reply_to_id=question.id)
    res = client.get(f"/conversations/{group}/messages", headers=rahul["headers"]).json()
    assert [m["type"] for m in res] == ["text", "text", "system"]
    assert res[0]["reply_to"]["id"] == question.id
    assert res[2]["meta"]["action"] == "group_created" and res[2]["body"] is None
