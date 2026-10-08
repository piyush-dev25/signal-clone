from app.models import ConversationMember
from app.services.receipts import advance


def member(delivered=0, read=0) -> ConversationMember:
    return ConversationMember(
        conversation_id=7, user_id=3, last_delivered_message_id=delivered, last_read_message_id=read
    )


def test_delivered_moves_forward():
    m = member(delivered=5)
    assert advance(m, delivered_up_to=9) == {"conversation_id": 7, "user_id": 3, "delivered_up_to": 9}
    assert m.last_delivered_message_id == 9


def test_cursors_never_move_backwards():
    m = member(delivered=9, read=6)
    assert advance(m, delivered_up_to=4) is None
    assert advance(m, delivered_up_to=9) is None
    assert advance(m, read_up_to=3) is None
    assert (m.last_delivered_message_id, m.last_read_message_id) == (9, 6)


def test_reading_also_delivers():
    m = member(delivered=2, read=2)
    update = advance(m, read_up_to=8)
    assert update == {"conversation_id": 7, "user_id": 3, "read_up_to": 8, "delivered_up_to": 8}
    assert (m.last_delivered_message_id, m.last_read_message_id) == (8, 8)


def test_read_below_delivered_only_moves_read():
    m = member(delivered=10, read=2)
    assert advance(m, read_up_to=5) == {"conversation_id": 7, "user_id": 3, "read_up_to": 5}
    assert m.last_delivered_message_id == 10
