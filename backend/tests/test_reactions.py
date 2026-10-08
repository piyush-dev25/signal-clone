import pytest
from sqlalchemy import func, select

from app.models import ConversationMember, MessageReaction
from app.services.auth import FIXED_OTP
from tests.live import connect, ping, settle


@pytest.fixture
def people(register):
    return {
        "priya": register("+919876543210", "Priya Sharma"),
        "rahul": register("+919812345678", "Rahul Verma"),
        "ananya": register("+919898989898", "Ananya Iyer"),
    }


@pytest.fixture
def dm(client, people) -> int:
    res = client.post("/conversations/direct", json={"user_id": people["rahul"]["id"]}, headers=people["priya"]["headers"])
    return res.json()["id"]


def send(client, user, conversation_id, body="hi", client_id="c-1"):
    res = client.post(
        f"/conversations/{conversation_id}/messages",
        json={"client_id": client_id, "body": body},
        headers=user["headers"],
    )
    assert res.status_code == 200, res.text
    return res.json()


def react(client, user, message_id, emoji):
    return client.put(f"/messages/{message_id}/reaction", json={"emoji": emoji}, headers=user["headers"])


def unreact(client, user, message_id):
    return client.delete(f"/messages/{message_id}/reaction", headers=user["headers"])


def history(client, user, conversation_id):
    return client.get(f"/conversations/{conversation_id}/messages", headers=user["headers"]).json()


# --- set / replace / remove ----------------------------------------------------------


def test_set_replace_and_same_emoji(client, people, dm):
    priya, rahul = people["priya"], people["rahul"]
    message = send(client, priya, dm)
    assert message["reactions"] == []  # new messages start empty

    res = react(client, rahul, message["id"], "👍")
    assert res.status_code == 200
    assert res.json() == [{"user_id": rahul["id"], "emoji": "👍"}]

    # A different emoji replaces the earlier one (one reaction per user per message).
    assert react(client, rahul, message["id"], "❤️").json() == [{"user_id": rahul["id"], "emoji": "❤️"}]
    # The same emoji again is a no-op.
    assert react(client, rahul, message["id"], "❤️").json() == [{"user_id": rahul["id"], "emoji": "❤️"}]


def test_reacting_to_your_own_message_and_order(client, people, dm):
    priya, rahul = people["priya"], people["rahul"]
    message = send(client, priya, dm)
    react(client, priya, message["id"], "😂")
    react(client, rahul, message["id"], "😮")
    assert react(client, priya, message["id"], "😂").json() == [
        {"user_id": priya["id"], "emoji": "😂"},
        {"user_id": rahul["id"], "emoji": "😮"},
    ]
    # Replacing keeps one entry per person. (Order is by time reacted, ties by user id; quick
    # successive requests can share a timestamp on Windows, so don't assert the order here.)
    replaced = react(client, priya, message["id"], "😢").json()
    assert sorted(replaced, key=lambda r: r["user_id"]) == [
        {"user_id": priya["id"], "emoji": "😢"},
        {"user_id": rahul["id"], "emoji": "😮"},
    ]


def test_remove_and_idempotent_remove(client, people, dm):
    priya, rahul = people["priya"], people["rahul"]
    message = send(client, priya, dm)
    react(client, rahul, message["id"], "👎")
    react(client, priya, message["id"], "👍")
    res = unreact(client, rahul, message["id"])
    assert res.status_code == 200
    assert res.json() == [{"user_id": priya["id"], "emoji": "👍"}]
    assert unreact(client, rahul, message["id"]).json() == [{"user_id": priya["id"], "emoji": "👍"}]


# --- validation and permissions ---------------------------------------------------------


@pytest.mark.parametrize("emoji", ["🔥", "", "👍👍", "heart", "❤"])  # "❤" lacks the U+FE0F variation selector
def test_only_allowed_emoji(client, people, dm, emoji):
    message = send(client, people["priya"], dm)
    assert react(client, people["rahul"], message["id"], emoji).status_code == 422


def test_non_member_is_rejected(client, people, dm):
    message = send(client, people["priya"], dm)
    assert react(client, people["ananya"], message["id"], "👍").status_code == 403
    assert unreact(client, people["ananya"], message["id"]).status_code == 403


def test_missing_message_is_404(client, people):
    assert react(client, people["priya"], 99999, "👍").status_code == 404
    assert unreact(client, people["priya"], 99999).status_code == 404


def test_system_messages_cannot_be_reacted_to(client, people):
    priya, rahul = people["priya"], people["rahul"]
    group = client.post(
        "/conversations/group", json={"name": "Trek", "member_ids": [rahul["id"]]}, headers=priya["headers"]
    ).json()
    system = group["last_message"]
    assert system["type"] == "system"
    assert react(client, rahul, system["id"], "👍").status_code == 400
    assert unreact(client, rahul, system["id"]).status_code == 400


def test_reactions_require_auth(client, people, dm):
    message = send(client, people["priya"], dm)
    assert client.put(f"/messages/{message['id']}/reaction", json={"emoji": "👍"}).status_code == 401
    assert client.delete(f"/messages/{message['id']}/reaction").status_code == 401


# --- payloads and side effects ---------------------------------------------------------------


def test_history_and_last_message_carry_reactions(client, people, dm):
    priya, rahul = people["priya"], people["rahul"]
    first = send(client, priya, dm, body="one", client_id="a")
    second = send(client, rahul, dm, body="two", client_id="b")
    react(client, priya, first["id"], "😂")
    react(client, rahul, first["id"], "❤️")
    page = {m["id"]: m["reactions"] for m in history(client, priya, dm)}
    assert page[first["id"]] == [{"user_id": priya["id"], "emoji": "😂"}, {"user_id": rahul["id"], "emoji": "❤️"}]
    assert page[second["id"]] == []
    last = client.get("/conversations", headers=priya["headers"]).json()[0]["last_message"]
    assert last["id"] == second["id"] and last["reactions"] == []


def test_reactions_have_no_side_effects(client, db, people, dm):
    priya, rahul = people["priya"], people["rahul"]
    older = send(client, rahul, dm, body="older", client_id="a")
    latest = send(client, rahul, dm, body="latest", client_id="b")
    other = client.post("/conversations/direct", json={"user_id": people["ananya"]["id"]}, headers=priya["headers"]).json()
    send(client, priya, other["id"], client_id="c")  # the most recent activity is in the other chat

    def snapshot():
        convs = client.get("/conversations", headers=priya["headers"]).json()
        db.expire_all()
        cursors = [
            (m.last_delivered_message_id, m.last_read_message_id)
            for m in db.scalars(select(ConversationMember).where(ConversationMember.conversation_id == dm))
        ]
        return [(c["id"], c["unread_count"], c["last_message"]["id"]) for c in convs], cursors

    before = snapshot()
    react(client, priya, older["id"], "👍")
    react(client, rahul, latest["id"], "😮")
    unreact(client, priya, older["id"])
    assert snapshot() == before  # unread, preview, order and cursors untouched


def test_removed_members_reactions_stay(client, people):
    priya, rahul, ananya = people["priya"], people["rahul"], people["ananya"]
    group = client.post(
        "/conversations/group", json={"name": "Trek", "member_ids": [rahul["id"], ananya["id"]]}, headers=priya["headers"]
    ).json()["id"]
    message = send(client, priya, group)
    react(client, ananya, message["id"], "❤️")
    client.delete(f"/conversations/{group}/members/{ananya['id']}", headers=priya["headers"])
    reactions = next(m for m in history(client, priya, group) if m["id"] == message["id"])["reactions"]
    assert reactions == [{"user_id": ananya["id"], "emoji": "❤️"}]


def test_reactions_cascade_when_the_group_is_deleted(client, db, people):
    priya, rahul = people["priya"], people["rahul"]
    group = client.post(
        "/conversations/group", json={"name": "Trek", "member_ids": [rahul["id"]]}, headers=priya["headers"]
    ).json()["id"]
    message = send(client, priya, group)
    react(client, rahul, message["id"], "👍")
    react(client, priya, message["id"], "❤️")
    assert db.scalar(select(func.count()).select_from(MessageReaction)) == 2
    client.post(f"/conversations/{group}/leave", headers=priya["headers"])
    client.post(f"/conversations/{group}/leave", headers=rahul["headers"])  # last one out deletes the group
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(MessageReaction)) == 0


# --- realtime ---------------------------------------------------------------------------------


@pytest.fixture
def live_people(live_client):
    def make(phone, name):
        auth = live_client.post("/auth/verify", json={"phone": phone, "otp": FIXED_OTP}).json()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        live_client.put("/me", json={"display_name": name}, headers=headers)
        return {"id": auth["user"]["id"], "token": auth["token"], "headers": headers}

    return {"priya": make("+919876543210", "Priya"), "rahul": make("+919812345678", "Rahul")}


def reaction_updates(ws):
    return [e["data"] for e in ping(ws) if e["type"] == "reaction_update"]


def test_reaction_update_reaches_members_and_own_tabs(live_client, live_people):
    priya, rahul = live_people["priya"], live_people["rahul"]
    dm_id = live_client.post("/conversations/direct", json={"user_id": rahul["id"]}, headers=priya["headers"]).json()["id"]
    message = send(live_client, priya, dm_id)
    with connect(live_client, priya) as p, connect(live_client, rahul) as r1, connect(live_client, rahul) as r2:
        settle(p, r1, r2)
        react(live_client, rahul, message["id"], "😂")
        expected = {
            "conversation_id": dm_id,
            "message_id": message["id"],
            "reactions": [{"user_id": rahul["id"], "emoji": "😂"}],
        }
        for ws in (p, r1, r2):  # the other member and the actor's other tab both get the snapshot
            assert reaction_updates(ws) == [expected]

        unreact(live_client, rahul, message["id"])
        assert reaction_updates(p) == [{**expected, "reactions": []}]


def test_reaction_noops_push_nothing(live_client, live_people):
    priya, rahul = live_people["priya"], live_people["rahul"]
    dm_id = live_client.post("/conversations/direct", json={"user_id": rahul["id"]}, headers=priya["headers"]).json()["id"]
    message = send(live_client, priya, dm_id)
    react(live_client, rahul, message["id"], "👍")
    with connect(live_client, priya) as p:
        settle(p)
        react(live_client, rahul, message["id"], "👍")  # same emoji
        unreact(live_client, priya, message["id"])  # nothing to remove
        assert reaction_updates(p) == []
