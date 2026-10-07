import pytest


@pytest.fixture
def priya(register):
    return register("+919876543210", "Priya Sharma")


@pytest.fixture
def rahul(register):
    return register("+919812345678", "Rahul Verma")


def test_add_contact_normalizes_phone_and_trims_nickname(client, priya, rahul):
    res = client.post(
        "/contacts", json={"phone": "+91 98123-45678", "nickname": "  Rahul bhai "}, headers=priya["headers"]
    )
    assert res.status_code == 201
    body = res.json()
    assert body["user_id"] == rahul["id"]
    assert body["phone"] == "+919812345678"
    assert body["display_name"] == "Rahul Verma"
    assert body["nickname"] == "Rahul bhai"


@pytest.mark.parametrize("nickname", [None, "", "   "])
def test_nickname_is_optional(client, priya, rahul, nickname):
    payload = {"phone": rahul["phone"]} if nickname is None else {"phone": rahul["phone"], "nickname": nickname}
    res = client.post("/contacts", json=payload, headers=priya["headers"])
    assert res.status_code == 201
    assert res.json()["nickname"] is None


def test_list_contacts_sorted_by_shown_name(client, priya, rahul, register):
    meera = register("+919900112233", "Meera Nair")
    register("+919731234567", "Arjun Mehta")
    for phone, nickname in [(rahul["phone"], None), (meera["phone"], "Aunty"), ("+919731234567", None)]:
        client.post("/contacts", json={"phone": phone, "nickname": nickname}, headers=priya["headers"])
    names = [c["nickname"] or c["display_name"] for c in client.get("/contacts", headers=priya["headers"]).json()]
    assert names == ["Arjun Mehta", "Aunty", "Rahul Verma"]


def test_contacts_are_per_owner(client, priya, rahul):
    client.post("/contacts", json={"phone": rahul["phone"]}, headers=priya["headers"])
    assert client.get("/contacts", headers=rahul["headers"]).json() == []


def test_unregistered_phone_is_404(client, priya):
    res = client.post("/contacts", json={"phone": "+919000000001"}, headers=priya["headers"])
    assert res.status_code == 404
    assert res.json()["detail"] == "No Signal account uses that number"


def test_adding_yourself_is_400(client, priya):
    res = client.post("/contacts", json={"phone": priya["phone"]}, headers=priya["headers"])
    assert res.status_code == 400


def test_duplicate_contact_is_409(client, priya, rahul):
    assert client.post("/contacts", json={"phone": rahul["phone"]}, headers=priya["headers"]).status_code == 201
    res = client.post("/contacts", json={"phone": "+91 98123 45678"}, headers=priya["headers"])
    assert res.status_code == 409


@pytest.mark.parametrize("phone", ["98123", "+91 098123 45678", "not a phone"])
def test_invalid_phone_is_422(client, priya, phone):
    assert client.post("/contacts", json={"phone": phone}, headers=priya["headers"]).status_code == 422


def test_contacts_require_auth(client):
    assert client.get("/contacts").status_code == 401
    assert client.post("/contacts", json={"phone": "+919812345678"}).status_code == 401
