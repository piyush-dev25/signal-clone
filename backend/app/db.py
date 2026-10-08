from collections.abc import Iterator
from datetime import datetime, timezone

from sqlalchemy import DateTime, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

from app.config import settings


def _sqlite_pragmas(dbapi_connection, _record) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def make_engine(url: str):
    """SQLite engine with foreign keys and WAL on every connection."""
    kwargs: dict = {"connect_args": {"check_same_thread": False}}
    if make_url(url).database in (None, "", ":memory:"):
        # In-memory SQLite (tests): one shared connection so every session sees the same tables.
        # Fine for one request at a time; concurrent sessions would share a transaction.
        kwargs["poolclass"] = StaticPool
    new_engine = create_engine(url, **kwargs)
    event.listen(new_engine, "connect", _sqlite_pragmas)
    return new_engine


engine = make_engine(settings.database_url)


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Stores naive UTC in SQLite; always hands back tz-aware UTC (serialized with a trailing Z)."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None and value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        return value.replace(tzinfo=timezone.utc) if value is not None else None
