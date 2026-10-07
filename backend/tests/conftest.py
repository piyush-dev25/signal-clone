import os

# Must be set before the app (and its engine) is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-bytes"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
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
