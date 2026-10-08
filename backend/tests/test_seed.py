import dataclasses

import pytest
from sqlalchemy import func, select

from app import seed
from app.models import Contact, Conversation, ConversationMember, Message, MessageReaction, User
from app.seed import USERS, run_seed
from app.services.conversations import list_conversations
from app.services.phone import normalize_phone
from app.services.reactions import ALLOWED_REACTIONS

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


# --- seeded reactions (phase 10) ---------------------------------------------------------------


def _seeded_reactions(db):
    return db.execute(
        select(MessageReaction, Message, User)
        .join(Message, Message.id == MessageReaction.message_id)
        .join(User, User.id == MessageReaction.user_id)
    ).all()


def test_seeded_reactions_are_valid(db):
    run_seed(db)
    rows = _seeded_reactions(db)
    assert len(rows) == 6
    pairs = [(reaction.message_id, reaction.user_id) for reaction, _, _ in rows]
    assert len(pairs) == len(set(pairs))  # one per person per message
    for reaction, message, user in rows:
        assert reaction.emoji in ALLOWED_REACTIONS
        assert message.type == "text"
        member = db.get(ConversationMember, (message.conversation_id, user.id))
        assert member is not None, f"{user.display_name} isn't in conversation {message.conversation_id}"
        # Only on messages the reactor has already received (cursors stay consistent).
        assert member.last_delivered_message_id >= message.id
        assert reaction.created_at >= message.created_at


def test_seeded_reactions_content(db):
    run_seed(db)
    found = {}
    for reaction, message, user in _seeded_reactions(db):
        found.setdefault(message.body, []).append((user.display_name.split()[0], reaction.emoji))
    assert found == {
        "Traffic is crazy on the ring road, take the metro": [("Priya", "👍")],
        "I booked seats in row F": [("Rahul", "❤️")],
        "5 AM sounds right. I'll book the homestay for Saturday night": [
            ("Rahul", "👍"),
            ("Ananya", "👍"),
            ("Vikram", "❤️"),
        ],
        "I'm only on chapter 4, no spoilers 🙈": [("Meera", "😂")],
    }


def test_seeded_reactions_show_in_history(client, db):
    run_seed(db)
    token = client.post("/auth/verify", json={"phone": USERS[0][1], "otp": "123456"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    trek = next(c for c in client.get("/conversations", headers=headers).json() if c["name"] == "Weekend Trek")
    history = client.get(f"/conversations/{trek['id']}/messages", headers=headers).json()
    reacted = [m for m in history if m["reactions"]]
    assert len(reacted) == 1
    assert sorted(r["emoji"] for r in reacted[0]["reactions"]) == sorted(["👍", "👍", "❤️"])


# Pinned before reactions were seeded: reactions must not change any of this.
EXPECTED_LISTS = {
    "+919876543210": [
        ("Rahul Verma", 3),
        ("Weekend Trek", 4),
        ("Meera Nair", 2),
        ("Ananya Iyer", 0),
        ("Book Club", 0),
        ("Vikram Singh", 0),
    ],
    "+919812345678": [("Priya Sharma", 0), ("Weekend Trek", 0), ("Arjun Mehta", 0)],
    "+919898989898": [("Weekend Trek", 2), ("Priya Sharma", 1), ("Book Club", 0)],
}


def test_seeded_lists_and_unread_are_pinned(db):
    run_seed(db)
    for phone, expected in EXPECTED_LISTS.items():
        user = db.scalar(select(User).where(User.phone == phone))
        rows = []
        for c in list_conversations(db, user):
            title = c.name or next(m.display_name for m in c.members if m.user_id != user.id)
            rows.append((title, c.unread_count))
        assert rows == expected, phone


@pytest.mark.parametrize(
    "bad",
    [
        (8, "rahul", "🔥"),  # not an allowed emoji
        (0, "rahul", "👍"),  # the group_created system message
        (8, "meera", "👍"),  # Meera isn't in Weekend Trek
        (5, "rahul", "😂"),  # duplicate with the next entry
    ],
)
def test_invalid_seed_reactions_fail_loudly(db, monkeypatch, bad):
    trek = seed.THREADS[1]
    extra = [bad, (5, "rahul", "😮")] if bad[0] == 5 else [bad]
    threads = list(seed.THREADS)
    threads[1] = dataclasses.replace(trek, reactions=trek.reactions + extra)
    monkeypatch.setattr(seed, "THREADS", threads)
    with pytest.raises(ValueError):
        run_seed(db)
