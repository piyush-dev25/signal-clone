from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User

# Must match PRESETS in frontend/src/lib/avatars.ts.
PRESET_AVATARS = frozenset({"cat", "dog", "fox", "panda", "owl", "octopus", "rocket", "sunflower"})


def get_or_create_by_phone(db: Session, phone: str) -> tuple[User, bool]:
    """Look up a user by normalized phone, creating one with an empty name if needed."""
    user = db.scalar(select(User).where(User.phone == phone))
    if user is not None:
        return user, False
    user = User(phone=phone, display_name="")
    db.add(user)
    db.commit()
    return user, True


def update_profile(db: Session, user: User, changes: dict[str, Any]) -> User:
    """Apply only the fields the client sent (avatar=None clears the avatar)."""
    for field in ("display_name", "avatar"):
        if field in changes:
            setattr(user, field, changes[field])
    db.commit()
    return user
