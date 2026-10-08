import os

# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-bytes"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Conversation, ConversationMember, Message  # noqa: E402
from app.realtime import presence  # noqa: E402
from app.realtime.manager import manager  # noqa: E402
from app.services.auth import FIXED_OTP  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def login(client):
    """Verify a phone with the fixed OTP; returns the /auth/verify JSON."""

    def _login(phone: str = "+919876543210") -> dict:
        res = client.post("/auth/verify", json={"phone": phone, "otp": FIXED_OTP})
        assert res.status_code == 200, res.text
        return res.json()

    return _login


@pytest.fixture
def auth_headers(login):
    def _headers(phone: str = "+919876543210") -> dict:
        return {"Authorization": f"Bearer {login(phone)['token']}"}

    return _headers


@pytest.fixture
def register(client, login):
    """Create a named user; returns {id, phone, name, headers}."""

    def _register(phone: str, name: str) -> dict:
        auth = login(phone)
        headers = {"Authorization": f"Bearer {auth['token']}"}
        assert client.put("/me", json={"display_name": name}, headers=headers).status_code == 200
        return {"id": auth["user"]["id"], "phone": auth["user"]["phone"], "name": name, "headers": headers}

    return _register


@pytest.fixture
def add_message(db):
    """Insert a message directly (there is no send service until Phase 3)."""

    def _add(conversation_id: int, sender_id: int, body: str = "hi", *, system: bool = False, reply_to_id=None):
        message = Message(
            conversation_id=conversation_id,
            sender_id=sender_id,
            type="system" if system else "text",
            body=None if system else body,
            meta={"action": "group_created", "actor_id": sender_id} if system else None,
            reply_to_id=reply_to_id,
        )
        db.add(message)
        db.commit()
        return message

    return _add


@pytest.fixture
def make_group(db):
    """Create a group directly (group endpoints arrive in Phase 5). First member is admin."""

    def _make(name: str, member_ids: list[int]) -> int:
        group = Conversation(type="group", name=name, created_by=member_ids[0])
        db.add(group)
        db.flush()
        db.add_all(
            ConversationMember(conversation_id=group.id, user_id=uid, role="admin" if i == 0 else "member")
            for i, uid in enumerate(member_ids)
        )
        db.commit()
        return group.id

    return _make


@pytest.fixture
def live_client(monkeypatch):
    """A TestClient whose REST calls and websockets share one event loop, so pushes scheduled by
    REST handlers reach the test's sockets. The seed is disabled to keep the database empty."""
    monkeypatch.setattr("app.main.run_seed", lambda db: False)
    manager.clear()
    with TestClient(app) as client:
        yield client
        client.portal.call(presence.cancel_all)  # on the app's loop, before it shuts down
    manager.clear()
