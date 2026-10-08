from datetime import timedelta

import pytest

from app.db import utcnow
from app.models import Conversation, ConversationMember


@pytest.fixture
def priya(register):
    return register("+919876543210", "Priya Sharma")


@pytest.fixture
def rahul(register):
    return register("+919812345678", "Rahul Verma")


@pytest.fixture
def ananya(register):
    return register("+919898989898", "Ananya Iyer")


def open_direct(client, me, other) -> dict:
    res = client.post("/conversations/direct", json={"user_id": other["id"]}, headers=me["headers"])
    assert res.status_code == 200, res.text
    return res.json()


def conversations(client, user) -> list[dict]:
    res = client.get("/conversations", headers=user["headers"])
    assert res.status_code == 200
    return res.json()


def set_read(db, conversation_id, user_id, message_id):
    member = db.get(ConversationMember, (conversation_id, user_id))
    member.last_read_message_id = message_id
    member.last_delivered_message_id = max(member.last_delivered_message_id, message_id)
    db.commit()


# --- direct get-or-create ----------------------------------------------------


def test_direct_get_or_create_is_the_same_conversation_both_ways(client, db, priya, rahul):
    first = open_direct(client, priya, rahul)
    again = open_direct(client, priya, rahul)
    reverse = open_direct(client, rahul, priya)
    assert first["id"] == again["id"] == reverse["id"]
    assert first["type"] == "direct"
    lo, hi = sorted([priya["id"], rahul["id"]])
    assert db.get(Conversation, first["id"]).direct_key == f"{lo}:{hi}"
    assert len(conversations(client, priya)) == 1


def test_direct_with_yourself_is_400(client, priya):
    res = client.post("/conversations/direct", json={"user_id": priya["id"]}, headers=priya["headers"])
    assert res.status_code == 400


def test_direct_with_unknown_user_is_404(client, priya):
    res = client.post("/conversations/direct", json={"user_id": 9999}, headers=priya["headers"])
    assert res.status_code == 404


def test_conversation_object_shape(client, priya, rahul, add_message):
    client.post("/contacts", json={"phone": rahul["phone"], "nickname": "Rahul bhai"}, headers=priya["headers"])
    conv = open_direct(client, priya, rahul)
    assert conv["unread_count"] == 0
    assert conv["last_message"] is None
    assert conv["name"] is None
    assert conv["created_at"].endswith("Z")
    members = {m["user_id"]: m for m in conv["members"]}
    assert set(members) == {priya["id"], rahul["id"]}
    assert members[rahul["id"]]["nickname"] == "Rahul bhai"  # the viewer's nickname
    assert members[priya["id"]]["nickname"] is None
    assert members[rahul["id"]] | {"nickname": None} == {
        "user_id": rahul["id"],
        "display_name": "Rahul Verma",
        "avatar": None,
        "phone": rahul["phone"],
        "nickname": None,
        "role": "member",
        "online": False,
        "last_seen": None,
        "last_delivered": 0,
        "last_read": 0,
    }
    # Rahul sees no nickname: nicknames belong to the viewer. (He sees the chat once it has a message.)
    add_message(conv["id"], priya["id"])
    rahul_view = conversations(client, rahul)[0]
    assert all(m["nickname"] is None for m in rahul_view["members"])


def test_conversations_require_auth(client):
    assert client.get("/conversations").status_code == 401


# --- unread counts -----------------------------------------------------------


def test_unread_excludes_own_and_system_messages(client, priya, rahul, add_message, make_group):
    group = make_group("Trek", [priya["id"], rahul["id"]])
    add_message(group, priya["id"], system=True)  # system: never unread
    add_message(group, rahul["id"], "one")
    add_message(group, priya["id"], "mine")  # own: never unread
    add_message(group, rahul["id"], "two")
    [conv] = conversations(client, priya)
    assert conv["unread_count"] == 2
    [conv] = conversations(client, rahul)
    assert conv["unread_count"] == 1  # only Priya's text message


def test_unread_counts_only_after_read_cursor(client, db, priya, rahul, add_message):
    conv_id = open_direct(client, priya, rahul)["id"]
    first = add_message(conv_id, rahul["id"], "a")
    second = add_message(conv_id, rahul["id"], "b")
    add_message(conv_id, rahul["id"], "c")
    assert conversations(client, priya)[0]["unread_count"] == 3
    set_read(db, conv_id, priya["id"], first.id)
    assert conversations(client, priya)[0]["unread_count"] == 2
    set_read(db, conv_id, priya["id"], second.id + 1)  # caught up
    assert conversations(client, priya)[0]["unread_count"] == 0


def test_members_expose_cursors(client, db, priya, rahul, add_message):
    conv_id = open_direct(client, priya, rahul)["id"]
    message = add_message(conv_id, priya["id"])
    set_read(db, conv_id, rahul["id"], message.id)
    member = next(m for m in conversations(client, priya)[0]["members"] if m["user_id"] == rahul["id"])
    assert (member["last_delivered"], member["last_read"]) == (message.id, message.id)


# --- last message and ordering ----------------------------------------------


def test_last_message_includes_reply_to(client, priya, rahul, add_message):
    conv_id = open_direct(client, priya, rahul)["id"]
    question = add_message(conv_id, rahul["id"], "Deadline Friday?")
    add_message(conv_id, priya["id"], "Moved to Wednesday", reply_to_id=question.id)
    last = conversations(client, priya)[0]["last_message"]
    assert last["body"] == "Moved to Wednesday"
    assert last["sender_id"] == priya["id"]
    assert last["reply_to"] == {"id": question.id, "sender_id": rahul["id"], "type": "text", "body": "Deadline Friday?"}
    assert last["created_at"].endswith("Z")


def test_ordered_by_latest_message(client, priya, rahul, ananya, add_message, make_group):
    with_rahul = open_direct(client, priya, rahul)["id"]
    with_ananya = open_direct(client, priya, ananya)["id"]
    group = make_group("Trek", [priya["id"], rahul["id"], ananya["id"]])
    add_message(with_rahul, rahul["id"])
    add_message(group, ananya["id"])
    add_message(with_ananya, ananya["id"])
    assert [c["id"] for c in conversations(client, priya)] == [with_ananya, group, with_rahul]
    add_message(with_rahul, priya["id"])  # new activity moves it to the top
    assert [c["id"] for c in conversations(client, priya)] == [with_rahul, with_ananya, group]


def test_empty_conversations_sort_by_created_at(client, db, priya, rahul, ananya, add_message):
    old_chat = open_direct(client, priya, rahul)["id"]
    db.get(Conversation, old_chat).created_at = utcnow() - timedelta(days=2)
    db.commit()
    active = open_direct(client, priya, ananya)["id"]
    add_message(active, ananya["id"])
    ordered = [c["id"] for c in conversations(client, priya)]
    assert ordered == [active, old_chat]  # older empty chat sinks below recent activity

    # A conversation created after the latest message (e.g. a just-opened chat) comes first.
    meera = client.post("/auth/verify", json={"phone": "+919900112233", "otp": "123456"}).json()["user"]
    just_opened = open_direct(client, priya, {"id": meera["id"]})["id"]
    assert [c["id"] for c in conversations(client, priya)] == [just_opened, active, old_chat]


def test_only_my_conversations_are_listed(client, priya, rahul, ananya):
    open_direct(client, rahul, ananya)
    assert conversations(client, priya) == []


def test_empty_direct_chat_is_only_listed_for_its_creator(client, priya, rahul, add_message):
    conv_id = open_direct(client, priya, rahul)["id"]
    assert [c["id"] for c in conversations(client, priya)] == [conv_id]
    assert conversations(client, rahul) == []
    # Opening it from the other side doesn't make Rahul its creator, but the first message reveals it.
    open_direct(client, rahul, priya)
    assert conversations(client, rahul) == []
    add_message(conv_id, priya["id"])
    assert [c["id"] for c in conversations(client, rahul)] == [conv_id]


def test_empty_groups_are_listed_for_everyone(client, priya, rahul, make_group):
    group = make_group("Trek", [priya["id"], rahul["id"]])
    assert [c["id"] for c in conversations(client, rahul)] == [group]
