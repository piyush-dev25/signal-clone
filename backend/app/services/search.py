import re

from sqlalchemy.orm import Session

from app.models import User
from app.schemas.contact import ContactOut
from app.schemas.conversation import ConversationOut
from app.schemas.search import SearchOut
from app.services.contacts import list_contacts
from app.services.conversations import list_conversations

MAX_RESULTS = 20


def _matches(query: str, digits: str, *fields: str | None) -> bool:
    for field in fields:
        if not field:
            continue
        if query in field.casefold():
            return True
        # "98765 43210" or "+91-98765" should still find "+919876543210".
        if digits and digits in re.sub(r"\D", "", field):
            return True
    return False


def search(db: Session, viewer: User, q: str) -> SearchOut:
    """Case-insensitive name/phone match over the viewer's contacts and conversations. No message bodies.

    Runs in Python over the viewer's own (small) data so matching is Unicode-aware and
    identical to how names are displayed.
    """
    query = q.strip().casefold()
    if not query:
        return SearchOut(contacts=[], conversations=[])
    digits = re.sub(r"\D", "", query) if re.fullmatch(r"[\d\s()+\-.]+", query) else ""

    contacts: list[ContactOut] = [
        c for c in list_contacts(db, viewer) if _matches(query, digits, c.nickname, c.display_name, c.phone)
    ]

    conversations: list[ConversationOut] = []
    for conv in list_conversations(db, viewer):
        if conv.type == "group":
            hit = _matches(query, "", conv.name)
        else:
            others = [m for m in conv.members if m.user_id != viewer.id]
            hit = any(_matches(query, digits, m.nickname, m.display_name, m.phone) for m in others)
        if hit:
            conversations.append(conv)

    return SearchOut(contacts=contacts[:MAX_RESULTS], conversations=conversations[:MAX_RESULTS])
