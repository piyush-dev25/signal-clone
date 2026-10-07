from datetime import timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import utcnow
from app.models import User
from app.services.errors import InvalidOtp

FIXED_OTP = "123456"  # mocked SMS: every number accepts this code
TOKEN_TTL = timedelta(days=7)
_ALGORITHM = "HS256"


def request_otp(phone: str) -> None:
    """No SMS is sent; the client shows the fixed code as a hint."""


def verify_otp(db: Session, phone: str, otp: str) -> tuple[User, bool]:
    """Check the code and get-or-create the user. Returns (user, is_new)."""
    if otp != FIXED_OTP:
        raise InvalidOtp()
    user = db.scalar(select(User).where(User.phone == phone))
    if user is not None:
        return user, False
    user = User(phone=phone, display_name="")
    db.add(user)
    db.commit()
    return user, True


def create_token(user_id: int, ttl: timedelta = TOKEN_TTL) -> str:
    now = utcnow()
    payload = {"sub": str(user_id), "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def user_from_token(db: Session, token: str | None) -> User | None:
    """The user a token belongs to, or None if the token is bad/expired or the user is gone."""
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[_ALGORITHM], options={"require": ["sub", "exp"]}
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None
    return db.get(User, user_id)
