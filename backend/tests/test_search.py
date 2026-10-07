import pytest


@pytest.fixture
def world(client, register, make_group, add_message):
    priya = register("+919876543210", "Priya Sharma")
    rahul = register("+919812345678", "Rahul Verma")
    meera = register("+919900112233", "Meera Nair")
    stranger = register("+919731234567", "Arjun Mehta")  # not a contact, no shared chat
    client.post("/contacts", json={"phone": rahul["phone"]}, headers=priya["headers"])
    client.post("/contacts", json={"phone": meera["phone"], "nickname": "Bookworm"}, headers=priya["headers"])
    dm = client.post("/conversations/direct", json={"user_id": rahul["id"]}, headers=priya["headers"]).json()["id"]
    group = make_group("Weekend Trek", [priya["id"], rahul["id"]])
    add_message(group, rahul["id"], "Let's meet at Meera's place")  # bodies must never match
    return {"priya": priya, "rahul": rahul, "meera": meera, "stranger": stranger, "dm": dm, "group": group}


def search(client, user, q):
    res = client.get("/search", params={"q": q}, headers=user["headers"])
    assert res.status_code == 200, res.text
    body = res.json()
    return [c["user_id"] for c in body["contacts"]], [c["id"] for c in body["conversations"]]


def test_contact_by_display_name_case_insensitive(client, world):
    contacts, conversations = search(client, world["priya"], "rAHul")
    assert contacts == [world["rahul"]["id"]]
    assert conversations == [world["dm"]]  # DM matches the other member's name


def test_contact_by_nickname(client, world):
    contacts, _ = search(client, world["priya"], "bookw")
    assert contacts == [world["meera"]["id"]]


def test_contact_by_phone_digits(client, world):
    contacts, conversations = search(client, world["priya"], "98123 456")
    assert contacts == [world["rahul"]["id"]]
    assert conversations == [world["dm"]]


def test_group_by_name(client, world):
    _, conversations = search(client, world["priya"], "trek")
    assert conversations == [world["group"]]


def test_message_bodies_never_match(client, world):
    contacts, conversations = search(client, world["priya"], "place")
    assert contacts == [] and conversations == []


def test_non_contacts_and_other_peoples_chats_are_not_returned(client, world):
    contacts, conversations = search(client, world["priya"], "arjun")
    assert contacts == [] and conversations == []
    _, conversations = search(client, world["stranger"], "trek")
    assert conversations == []


def test_blank_query_returns_nothing_and_missing_query_is_422(client, world):
    assert search(client, world["priya"], "   ") == ([], [])
    assert client.get("/search", headers=world["priya"]["headers"]).status_code == 422


def test_search_requires_auth(client):
    assert client.get("/search", params={"q": "a"}).status_code == 401
