from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("owner_id", "contact_user_id"),
        CheckConstraint("owner_id != contact_user_id", name="ck_contacts_not_self"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    contact_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    nickname: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
