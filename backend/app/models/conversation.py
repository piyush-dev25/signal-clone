from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, UTCDateTime, utcnow


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("type IN ('direct', 'group')", name="ck_conversations_type"),
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(10))
    name: Mapped[str | None] = mapped_column(String(100))
    avatar: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # "minUserId:maxUserId" for direct chats; enforces one direct chat per user pair.
    direct_key: Mapped[str | None] = mapped_column(String(32), unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        CheckConstraint("role IN ('admin', 'member')", name="ck_conversation_members_role"),
        Index("ix_conversation_members_user_id", "user_id"),
    )

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(10), default="member")
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    last_delivered_message_id: Mapped[int] = mapped_column(default=0, server_default="0")
    last_read_message_id: Mapped[int] = mapped_column(default=0, server_default="0")
