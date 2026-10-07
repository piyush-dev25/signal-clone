import pytest


def test_get_me(client, login):
    auth = login("+919876543210")
    res = client.get("/me", headers={"Authorization": f"Bearer {auth['token']}"})
    assert res.status_code == 200
    assert res.json() == auth["user"]


def test_update_display_name_is_trimmed(client, auth_headers):
    headers = auth_headers()
    res = client.put("/me", json={"display_name": "  Priya Sharma  "}, headers=headers)
    assert res.status_code == 200
    assert res.json()["display_name"] == "Priya Sharma"
    assert client.get("/me", headers=headers).json()["display_name"] == "Priya Sharma"


@pytest.mark.parametrize("name", ["", "   ", "x" * 51, None])
def test_invalid_display_name_is_422(client, auth_headers, name):
    res = client.put("/me", json={"display_name": name}, headers=auth_headers())
    assert res.status_code == 422


def test_display_name_of_50_chars_is_allowed(client, auth_headers):
    res = client.put("/me", json={"display_name": "x" * 50}, headers=auth_headers())
    assert res.status_code == 200


def test_set_preset_avatar(client, auth_headers):
    res = client.put("/me", json={"avatar": "preset:fox"}, headers=auth_headers())
    assert res.status_code == 200
    assert res.json()["avatar"] == "preset:fox"


@pytest.mark.parametrize("avatar", ["preset:unicorn", "fox", "data:image/png;base64,AAAA", ""])
def test_invalid_avatar_is_422(client, auth_headers, avatar):
    res = client.put("/me", json={"avatar": avatar}, headers=auth_headers())
    assert res.status_code == 422


def test_null_avatar_clears_and_omitted_fields_are_untouched(client, auth_headers):
    headers = auth_headers()
    client.put("/me", json={"display_name": "Priya", "avatar": "preset:owl"}, headers=headers)

    res = client.put("/me", json={"avatar": None}, headers=headers)
    assert res.json()["avatar"] is None
    assert res.json()["display_name"] == "Priya"

    res = client.put("/me", json={"display_name": "Priya S"}, headers=headers)
    assert res.json()["avatar"] is None
    assert res.json()["display_name"] == "Priya S"


def test_update_me_requires_auth(client):
    assert client.put("/me", json={"display_name": "X"}).status_code == 401
