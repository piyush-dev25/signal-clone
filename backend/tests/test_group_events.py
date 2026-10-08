"""Group pushes over real (test) websockets."""

import pytest

from app.services.auth import FIXED_OTP
from tests.live import connect, ping, settle


@pytest.fixture
def people(live_client):
    def make(phone, name):
        auth = live_client.post("/auth/verify", json={"phone": phone, "otp": FIXED_OTP}).json()
        headers = {"Authorization": f"Bearer {auth['token']}"}
        live_client.put("/me", json={"display_name": name}, headers=headers)
        return {"id": auth["user"]["id"], "token": auth["token"], "headers": headers}

    return {
        "priya": make("+919876543210", "Priya"),
        "rahul": make("+919812345678", "Rahul"),
        "ananya": make("+919898989898", "Ananya"),
        "meera": make("+919900112233", "Meera"),
    }


def group_events(ws):
    """Group-related events received so far, as (type, summary)."""
    out = []
    for e in ping(ws):
        if e["type"] == "conversation_updated":
            out.append(("conversation_updated", e["data"]["id"]))
        elif e["type"] == "message_new" and e["data"]["type"] == "system":
            out.append(("system", e["data"]["meta"]["action"]))
        elif e["type"] == "conversation_removed":
            out.append(("conversation_removed", e["data"]["conversation_id"]))
    return out


def create(client, creator, *members, name="Trek"):
    res = client.post(
        "/conversations/group",
        json={"name": name, "member_ids": [m["id"] for m in members]},
        headers=creator["headers"],
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


def test_create_reaches_every_member(live_client, people):
    priya, rahul, ananya = people["priya"], people["rahul"], people["ananya"]
    with connect(live_client, priya) as p, connect(live_client, rahul) as r, connect(live_client, ananya) as a:
        settle(p, r, a)
        gid = create(live_client, priya, rahul, ananya)
        for ws in (p, r, a):
            assert group_events(ws) == [("conversation_updated", gid), ("system", "group_created")]


def test_conversation_updated_is_built_per_recipient(live_client, people):
    priya, rahul, ananya = people["priya"], people["rahul"], people["ananya"]
    live_client.post("/contacts", json={"phone": "+919898989898", "nickname": "Annu"}, headers=rahul["headers"])
    with connect(live_client, priya) as p, connect(live_client, rahul) as r:
        settle(p, r)
        create(live_client, priya, rahul, ananya)
        updates = {}
        for name, ws in (("priya", p), ("rahul", r)):
            event = next(e for e in ping(ws) if e["type"] == "conversation_updated")
            updates[name] = {m["user_id"]: m["nickname"] for m in event["data"]["members"]}
        assert updates["rahul"][ananya["id"]] == "Annu"
        assert updates["priya"][ananya["id"]] is None


def test_new_member_gets_the_conversation_before_its_messages(live_client, people):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    gid = create(live_client, priya, rahul)
    with connect(live_client, meera) as m, connect(live_client, rahul) as r:
        settle(m, r)
        live_client.post(f"/conversations/{gid}/members", json={"user_ids": [meera["id"]]}, headers=priya["headers"])
        assert group_events(m) == [("conversation_updated", gid), ("system", "member_added")]
        assert group_events(r) == [("conversation_updated", gid), ("system", "member_added")]


def test_removed_member_is_told_and_gets_nothing_else(live_client, people):
    priya, rahul, ananya = people["priya"], people["rahul"], people["ananya"]
    gid = create(live_client, priya, rahul, ananya)
    with connect(live_client, ananya) as a, connect(live_client, rahul) as r:
        settle(a, r)
        live_client.delete(f"/conversations/{gid}/members/{ananya['id']}", headers=priya["headers"])
        assert group_events(a) == [("conversation_removed", gid)]
        assert group_events(r) == [("conversation_updated", gid), ("system", "member_removed")]
        # Later messages in the group don't reach her.
        live_client.post(f"/conversations/{gid}/messages", json={"client_id": "x", "body": "hi"}, headers=rahul["headers"])
        assert [e for e in ping(a) if e["type"] == "message_new"] == []


def test_leaving_last_admin_notifies_leaver_and_announces_promotion(live_client, people):
    priya, rahul, ananya = people["priya"], people["rahul"], people["ananya"]
    gid = create(live_client, priya, rahul, ananya)
    with connect(live_client, priya) as p, connect(live_client, rahul) as r:
        settle(p, r)
        assert live_client.post(f"/conversations/{gid}/leave", headers=priya["headers"]).status_code == 204
        assert group_events(p) == [("conversation_removed", gid)]
        assert group_events(r) == [
            ("conversation_updated", gid),
            ("system", "member_left"),
            ("system", "role_changed"),
        ]


def test_noop_changes_push_nothing(live_client, people):
    priya, rahul = people["priya"], people["rahul"]
    gid = create(live_client, priya, rahul, name="Same")
    with connect(live_client, rahul) as r:
        ping(r)
        live_client.patch(f"/conversations/{gid}", json={"name": "Same"}, headers=priya["headers"])
        live_client.post(f"/conversations/{gid}/members", json={"user_ids": [rahul["id"]]}, headers=priya["headers"])
        assert group_events(r) == []
