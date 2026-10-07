from datetime import timedelta

import jwt

from app.models import User
from app.services.auth import FIXED_OTP, create_token


def test_request_otp_always_succeeds(client):
    res = client.post("/auth/request-otp", json={"phone": "+91 98765 43210"})
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_request_otp_rejects_unparseable_phone(client):
    res = client.post("/auth/request-otp", json={"phone": "98765"})
    assert res.status_code == 422


def test_verify_creates_new_user(client):
    res = client.post("/auth/verify", json={"phone": "+91 98765-43210", "otp": FIXED_OTP})
    assert res.status_code == 200
    body = res.json()
    assert body["is_new"] is True
    assert body["token"]
    assert body["user"]["phone"] == "+919876543210"
    assert body["user"]["display_name"] == ""
    assert body["user"]["avatar"] is None
    assert body["user"]["created_at"].endswith("Z")


def test_verify_existing_user_is_not_new(client):
    first = client.post("/auth/verify", json={"phone": "+919876543210", "otp": FIXED_OTP}).json()
    # Same number, formatted differently.
    second = client.post("/auth/verify", json={"phone": "+91 (98765) 43210", "otp": FIXED_OTP}).json()
    assert second["is_new"] is False
    assert second["user"]["id"] == first["user"]["id"]


def test_verify_wrong_otp_is_400_and_creates_nothing(client, db):
    res = client.post("/auth/verify", json={"phone": "+919876543210", "otp": "000000"})
    assert res.status_code == 400
    assert db.query(User).count() == 0


def test_token_grants_access(client, login):
    token = login()["token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_missing_token_is_401(client):
    res = client.get("/me")
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


def test_expired_token_is_401(client, login):
    user_id = login()["user"]["id"]
    expired = create_token(user_id, ttl=timedelta(seconds=-1))
    assert client.get("/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_signed_with_other_key_is_401(client, login):
    user_id = login()["user"]["id"]
    other_key = "a-different-secret-key-also-32-bytes-long"
    forged = jwt.encode({"sub": str(user_id), "exp": 9999999999}, other_key, algorithm="HS256")
    assert client.get("/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_tampered_payload_is_401(client, login):
    token = login()["token"]
    header, payload, signature = token.split(".")
    other = login("+14155550100")["token"].split(".")[1]  # valid payload for a different user
    tampered = f"{header}.{other}.{signature}"
    assert client.get("/me", headers={"Authorization": f"Bearer {tampered}"}).status_code == 401


def test_garbage_token_is_401(client):
    assert client.get("/me", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_valid_token_for_deleted_user_is_401(client, login, db):
    auth = login()
    db.delete(db.get(User, auth["user"]["id"]))
    db.commit()
    res = client.get("/me", headers={"Authorization": f"Bearer {auth['token']}"})
    assert res.status_code == 401
