from datetime import datetime, timezone

import pytest

from app.models import Conversation, ConversationMember


@pytest.fixture
def people(register):
    return {
        "priya": register("+919876543210", "Priya Sharma"),
        "rahul": register("+919812345678", "Rahul Verma"),
        "ananya": register("+919898989898", "Ananya Iyer"),
        "meera": register("+919900112233", "Meera Nair"),
    }


def create(client, creator, name="Weekend Trek", members=()):
    return client.post(
        "/conversations/group", json={"name": name, "member_ids": [m["id"] for m in members]}, headers=creator["headers"]
    )


@pytest.fixture
def group(client, people):
    """Priya (admin) with Rahul and Ananya."""
    res = create(client, people["priya"], members=[people["rahul"], people["ananya"]])
    assert res.status_code == 200, res.text
    return res.json()["id"]


def conv(client, user, conversation_id):
    convs = client.get("/conversations", headers=user["headers"]).json()
    return next((c for c in convs if c["id"] == conversation_id), None)


def roles(client, user, conversation_id):
    return {m["display_name"].split()[0]: m["role"] for m in conv(client, user, conversation_id)["members"]}


def history(client, user, conversation_id):
    res = client.get(f"/conversations/{conversation_id}/messages", headers=user["headers"])
    assert res.status_code == 200, res.text
    return res.json()[::-1]  # oldest first


def system_actions(client, user, conversation_id):
    return [m["meta"]["action"] for m in history(client, user, conversation_id) if m["type"] == "system"]


# --- create ------------------------------------------------------------------


def test_create_group(client, people, group):
    priya, rahul = people["priya"], people["rahul"]
    c = conv(client, rahul, group)
    assert c["type"] == "group" and c["name"] == "Weekend Trek"
    assert roles(client, rahul, group) == {"Priya": "admin", "Rahul": "member", "Ananya": "member"}
    last = c["last_message"]
    assert last["type"] == "system" and last["body"] is None and last["sender_id"] == priya["id"]
    assert last["meta"] == {
        "action": "group_created",
        "actor_id": priya["id"],
        "actor_name": "Priya Sharma",
        "name": "Weekend Trek",
    }
    assert c["unread_count"] == 0  # system messages never count


def test_create_trims_name_and_returns_the_conversation(client, people):
    res = create(client, people["priya"], name="  Book Club  ", members=[people["meera"]])
    assert res.status_code == 200
    assert res.json()["name"] == "Book Club"
    assert len(res.json()["members"]) == 2


@pytest.mark.parametrize("name", ["", "   ", "x" * 51])
def test_create_rejects_bad_names(client, people, name):
    assert create(client, people["priya"], name=name, members=[people["rahul"]]).status_code == 422


def test_create_needs_distinct_members(client, people):
    priya, rahul = people["priya"], people["rahul"]
    assert create(client, priya, members=[]).status_code == 422
    res = client.post(
        "/conversations/group", json={"name": "X", "member_ids": [rahul["id"], rahul["id"]]}, headers=priya["headers"]
    )
    assert res.status_code == 422


def test_create_rejects_yourself_and_unknown_users(client, people):
    priya, rahul = people["priya"], people["rahul"]
    assert create(client, priya, members=[priya, rahul]).status_code == 400
    res = client.post("/conversations/group", json={"name": "X", "member_ids": [9999]}, headers=priya["headers"])
    assert res.status_code == 400


# --- rename ------------------------------------------------------------------


def test_admin_renames(client, people, group):
    priya = people["priya"]
    res = client.patch(f"/conversations/{group}", json={"name": "Rajmachi Trek"}, headers=priya["headers"])
    assert res.status_code == 200 and res.json()["name"] == "Rajmachi Trek"
    last = res.json()["last_message"]
    assert last["meta"]["action"] == "renamed" and last["meta"]["name"] == "Rajmachi Trek"


def test_unchanged_rename_is_a_noop(client, people, group):
    client.patch(f"/conversations/{group}", json={"name": "Weekend Trek"}, headers=people["priya"]["headers"])
    assert system_actions(client, people["priya"], group) == ["group_created"]


def test_non_admin_cannot_rename_and_outsiders_are_rejected(client, people, group):
    res = client.patch(f"/conversations/{group}", json={"name": "Mine now"}, headers=people["rahul"]["headers"])
    assert res.status_code == 403
    res = client.patch(f"/conversations/{group}", json={"name": "Mine now"}, headers=people["meera"]["headers"])
    assert res.status_code == 403
    res = client.patch("/conversations/9999", json={"name": "X"}, headers=people["priya"]["headers"])
    assert res.status_code == 404


# --- add ---------------------------------------------------------------------


def test_add_members_start_with_nothing_unread(client, people, group):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    client.post(f"/conversations/{group}/messages", json={"client_id": "a", "body": "Before Meera"}, headers=rahul["headers"])
    latest = conv(client, priya, group)["last_message"]["id"]

    res = client.post(f"/conversations/{group}/members", json={"user_ids": [meera["id"]]}, headers=priya["headers"])
    assert res.status_code == 200
    mine = next(m for m in res.json()["members"] if m["user_id"] == meera["id"])
    assert (mine["role"], mine["last_read"], mine["last_delivered"]) == ("member", latest, latest)

    meera_view = conv(client, meera, group)
    assert meera_view["unread_count"] == 0
    bodies = [m["body"] for m in history(client, meera, group)]
    assert "Before Meera" in bodies  # full history is visible
    assert system_actions(client, meera, group)[-1] == "member_added"


def test_adding_existing_members_is_skipped(client, people, group):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    client.post(
        f"/conversations/{group}/members", json={"user_ids": [rahul["id"], meera["id"]]}, headers=priya["headers"]
    )
    assert system_actions(client, priya, group) == ["group_created", "member_added"]  # only Meera
    client.post(f"/conversations/{group}/members", json={"user_ids": [meera["id"]]}, headers=priya["headers"])
    assert system_actions(client, priya, group) == ["group_created", "member_added"]  # nothing new


def test_one_system_message_per_added_member(client, people, register, group):
    arjun = register("+919731234567", "Arjun Mehta")
    priya, meera = people["priya"], people["meera"]
    client.post(
        f"/conversations/{group}/members", json={"user_ids": [meera["id"], arjun["id"]]}, headers=priya["headers"]
    )
    system = [m["meta"] for m in history(client, priya, group) if m["type"] == "system"]
    assert [meta["action"] for meta in system] == ["group_created", "member_added", "member_added"]
    added = [meta["target_id"] for meta in system[1:]]
    assert added == [meera["id"], arjun["id"]]


def test_only_admins_add_and_unknown_users_are_rejected(client, people, group):
    res = client.post(
        f"/conversations/{group}/members", json={"user_ids": [people["meera"]["id"]]}, headers=people["rahul"]["headers"]
    )
    assert res.status_code == 403
    res = client.post(f"/conversations/{group}/members", json={"user_ids": [9999]}, headers=people["priya"]["headers"])
    assert res.status_code == 400


# --- remove ------------------------------------------------------------------


def test_admin_removes_member(client, people, group):
    priya, ananya = people["priya"], people["ananya"]
    res = client.delete(f"/conversations/{group}/members/{ananya['id']}", headers=priya["headers"])
    assert res.status_code == 200
    assert ananya["id"] not in {m["user_id"] for m in res.json()["members"]}  # no longer holds back ticks
    meta = res.json()["last_message"]["meta"]
    assert meta["action"] == "member_removed" and meta["target_id"] == ananya["id"]
    assert meta["target_name"] == "Ananya Iyer"

    # Ananya loses access.
    assert conv(client, ananya, group) is None
    assert client.get(f"/conversations/{group}/messages", headers=ananya["headers"]).status_code == 403
    res = client.post(f"/conversations/{group}/messages", json={"client_id": "x", "body": "hi"}, headers=ananya["headers"])
    assert res.status_code == 403


def test_remove_rules(client, people, group):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    assert client.delete(f"/conversations/{group}/members/{priya['id']}", headers=priya["headers"]).status_code == 400
    assert client.delete(f"/conversations/{group}/members/{meera['id']}", headers=priya["headers"]).status_code == 404
    assert client.delete(f"/conversations/{group}/members/{priya['id']}", headers=rahul["headers"]).status_code == 403


# --- roles -------------------------------------------------------------------


def test_promote_and_demote(client, people, group):
    priya, rahul = people["priya"], people["rahul"]
    res = client.patch(f"/conversations/{group}/members/{rahul['id']}", json={"role": "admin"}, headers=priya["headers"])
    assert res.status_code == 200
    meta = res.json()["last_message"]["meta"]
    assert (meta["action"], meta["target_id"], meta["role"]) == ("role_changed", rahul["id"], "admin")
    # Two admins now: Rahul may demote Priya.
    res = client.patch(f"/conversations/{group}/members/{priya['id']}", json={"role": "member"}, headers=rahul["headers"])
    assert res.status_code == 200
    assert roles(client, priya, group) == {"Priya": "member", "Rahul": "admin", "Ananya": "member"}


def test_last_admin_cannot_be_demoted(client, people, group):
    priya = people["priya"]
    res = client.patch(f"/conversations/{group}/members/{priya['id']}", json={"role": "member"}, headers=priya["headers"])
    assert res.status_code == 400
    assert res.json()["detail"] == "A group needs at least one admin"


def test_role_rules(client, people, group):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    url = f"/conversations/{group}/members"
    assert client.patch(f"{url}/{rahul['id']}", json={"role": "owner"}, headers=priya["headers"]).status_code == 422
    assert client.patch(f"{url}/{meera['id']}", json={"role": "admin"}, headers=priya["headers"]).status_code == 404
    assert client.patch(f"{url}/{rahul['id']}", json={"role": "admin"}, headers=rahul["headers"]).status_code == 403
    client.patch(f"{url}/{rahul['id']}", json={"role": "member"}, headers=priya["headers"])  # unchanged: no-op
    assert system_actions(client, priya, group) == ["group_created"]


# --- leave -------------------------------------------------------------------


def test_member_leaves(client, people, group):
    priya, ananya = people["priya"], people["ananya"]
    assert client.post(f"/conversations/{group}/leave", headers=ananya["headers"]).status_code == 204
    assert conv(client, ananya, group) is None
    last = conv(client, priya, group)["last_message"]
    assert last["meta"]["action"] == "member_left" and last["meta"]["actor_id"] == ananya["id"]
    assert roles(client, priya, group) == {"Priya": "admin", "Rahul": "member"}


def test_last_admin_leaving_promotes_earliest_joined(client, db, people, register):
    priya, rahul, ananya, meera = people["priya"], people["rahul"], people["ananya"], people["meera"]
    gid = create(client, priya, members=[rahul, ananya]).json()["id"]
    client.post(f"/conversations/{gid}/members", json={"user_ids": [meera["id"]]}, headers=priya["headers"])
    # Rahul and Ananya joined at the same moment (tie) -> lowest user id wins; Meera joined later.
    same = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for uid in (rahul["id"], ananya["id"]):
        db.get(ConversationMember, (gid, uid)).joined_at = same
    db.commit()

    assert client.post(f"/conversations/{gid}/leave", headers=priya["headers"]).status_code == 204
    expected = min(rahul["id"], ananya["id"])
    view = conv(client, meera, gid)
    admins = [m["user_id"] for m in view["members"] if m["role"] == "admin"]
    assert admins == [expected]
    left, promoted = [m["meta"] for m in history(client, meera, gid)[-2:]]
    assert left["action"] == "member_left"
    assert promoted == {
        "action": "role_changed",
        "actor_id": expected,
        "actor_name": "Rahul Verma" if expected == rahul["id"] else "Ananya Iyer",
        "target_id": expected,
        "target_name": "Rahul Verma" if expected == rahul["id"] else "Ananya Iyer",
        "role": "admin",
    }


def test_non_last_admin_leaving_promotes_nobody(client, people, group):
    priya, rahul = people["priya"], people["rahul"]
    client.patch(f"/conversations/{group}/members/{rahul['id']}", json={"role": "admin"}, headers=priya["headers"])
    client.post(f"/conversations/{group}/leave", headers=priya["headers"])
    assert roles(client, rahul, group) == {"Rahul": "admin", "Ananya": "member"}
    assert system_actions(client, rahul, group)[-1] == "member_left"


def test_last_member_leaving_deletes_the_group(client, db, people):
    priya, rahul = people["priya"], people["rahul"]
    gid = create(client, priya, members=[rahul]).json()["id"]
    client.post(f"/conversations/{gid}/messages", json={"client_id": "a", "body": "hi"}, headers=rahul["headers"])
    client.post(f"/conversations/{gid}/leave", headers=priya["headers"])
    assert client.post(f"/conversations/{gid}/leave", headers=rahul["headers"]).status_code == 204
    db.expire_all()
    assert db.get(Conversation, gid) is None
    assert client.get(f"/conversations/{gid}/messages", headers=rahul["headers"]).status_code == 404


def test_outsider_cannot_leave(client, people, group):
    assert client.post(f"/conversations/{group}/leave", headers=people["meera"]["headers"]).status_code == 403


# --- direct conversations are not groups ------------------------------------------


def test_group_endpoints_reject_direct_chats(client, people):
    priya, rahul = people["priya"], people["rahul"]
    dm = client.post("/conversations/direct", json={"user_id": rahul["id"]}, headers=priya["headers"]).json()["id"]
    h = priya["headers"]
    assert client.patch(f"/conversations/{dm}", json={"name": "X"}, headers=h).status_code == 400
    assert client.post(f"/conversations/{dm}/members", json={"user_ids": [people["meera"]["id"]]}, headers=h).status_code == 400
    assert client.delete(f"/conversations/{dm}/members/{rahul['id']}", headers=h).status_code == 400
    assert client.patch(f"/conversations/{dm}/members/{rahul['id']}", json={"role": "admin"}, headers=h).status_code == 400
    assert client.post(f"/conversations/{dm}/leave", headers=h).status_code == 400


# --- unread ------------------------------------------------------------------


def test_system_messages_never_count_as_unread(client, people, group):
    priya, rahul, meera = people["priya"], people["rahul"], people["meera"]
    client.patch(f"/conversations/{group}", json={"name": "Renamed"}, headers=priya["headers"])
    client.post(f"/conversations/{group}/members", json={"user_ids": [meera["id"]]}, headers=priya["headers"])
    client.patch(f"/conversations/{group}/members/{rahul['id']}", json={"role": "admin"}, headers=priya["headers"])
    assert conv(client, rahul, group)["unread_count"] == 0
    client.post(f"/conversations/{group}/messages", json={"client_id": "a", "body": "hi"}, headers=priya["headers"])
    assert conv(client, rahul, group)["unread_count"] == 1
