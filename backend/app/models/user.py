from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"sqlite_autoincrement": True}

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(16), unique=True)
    display_name: Mapped[str] = mapped_column(String(50), default="")
    # Preset key ("preset:<key>"), small data URL, or NULL (initials).
    avatar: Mapped[str | None] = mapped_column(Text)
    last_seen: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
