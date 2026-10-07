from sqlalchemy import func, select

from app.models import Contact, Conversation, ConversationMember, Message, User
from app.seed import USERS, run_seed
from app.services.conversations import list_conversations
from app.services.phone import normalize_phone

TABLES = [User, Contact, Conversation, ConversationMember, Message]


def counts(db) -> dict:
    return {model.__tablename__: db.scalar(select(func.count()).select_from(model)) for model in TABLES}


def priya(db) -> User:
    return db.scalar(select(User).where(User.phone == USERS[0][1]))


def test_seed_is_idempotent(db):
    assert run_seed(db) is True
    before = counts(db)
    assert all(before.values())
    assert run_seed(db) is False
    assert counts(db) == before


def test_seed_skips_when_any_user_exists(db, login):
    login("+919000000001")
    assert run_seed(db) is False
    assert counts(db)["messages"] == 0


def test_seeded_phones_pass_normalization(db):
    run_seed(db)
    for user in db.scalars(select(User)):
        assert normalize_phone(user.phone) == user.phone
        assert user.display_name


def test_primary_user_sees_a_realistic_list(db):
    run_seed(db)
    convs = list_conversations(db, priya(db))
    assert len(convs) >= 5
    assert any(c.unread_count > 0 for c in convs)
    assert any(c.unread_count == 0 for c in convs)
    activity = [c.last_message.created_at for c in convs]
    assert activity == sorted(activity, reverse=True)
    assert {c.type for c in convs} == {"direct", "group"}


def test_message_ids_are_chronological(db):
    run_seed(db)
    messages = db.scalars(select(Message).order_by(Message.id)).all()
    assert all(a.created_at <= b.created_at for a, b in zip(messages, messages[1:]))


def test_seed_covers_spec_cases(db):
    run_seed(db)
    longest = db.scalar(
        select(func.count()).select_from(Message).group_by(Message.conversation_id).order_by(func.count().desc())
    )
    assert longest >= 100
    assert db.scalar(select(func.count()).where(Message.reply_to_id.is_not(None))) >= 1
    system = db.scalars(select(Message).where(Message.type == "system")).all()
    assert system and all(m.body is None and m.meta["action"] for m in system)
    admin_groups = db.scalars(
        select(ConversationMember)
        .join(Conversation, Conversation.id == ConversationMember.conversation_id)
        .where(Conversation.type == "group", ConversationMember.user_id == priya(db).id)
        .where(ConversationMember.role == "admin")
    ).all()
    assert admin_groups
    assert db.scalar(select(func.count()).select_from(Contact).where(Contact.owner_id == priya(db).id)) >= 3
    assert db.scalar(select(func.count()).where(User.last_seen.is_not(None))) >= 3


def test_cursors_are_consistent(db):
    run_seed(db)
    for member in db.scalars(select(ConversationMember)):
        assert member.last_delivered_message_id >= member.last_read_message_id
    # Mixed states: someone has an undelivered message and someone has read-but-not-latest.
    members = db.scalars(select(ConversationMember)).all()
    latest = dict(
        db.execute(select(Message.conversation_id, func.max(Message.id)).group_by(Message.conversation_id)).all()
    )
    assert any(m.last_delivered_message_id < latest[m.conversation_id] for m in members)
    assert any(m.last_read_message_id < m.last_delivered_message_id for m in members)
