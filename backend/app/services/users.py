from typing import Any

from sqlalchemy.orm import Session

from app.models import User

# Must match PRESETS in frontend/src/lib/avatars.ts.
PRESET_AVATARS = frozenset({"cat", "dog", "fox", "panda", "owl", "octopus", "rocket", "sunflower"})


def update_profile(db: Session, user: User, changes: dict[str, Any]) -> User:
    """Apply only the fields the client sent (avatar=None clears the avatar)."""
    for field in ("display_name", "avatar"):
        if field in changes:
            setattr(user, field, changes[field])
    db.commit()
    return user
