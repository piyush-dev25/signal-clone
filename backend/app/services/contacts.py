from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Contact, User
from app.schemas.contact import ContactOut
from app.services.errors import BadRequest, Conflict, NotFound


def contact_out(contact: Contact, user: User) -> ContactOut:
    return ContactOut(
        id=contact.id,
        user_id=user.id,
        phone=user.phone,
        display_name=user.display_name,
        avatar=user.avatar,
        nickname=contact.nickname,
        last_seen=user.last_seen,
    )


def _sort_key(contact: ContactOut) -> str:
    return (contact.nickname or contact.display_name or contact.phone).casefold()


def list_contacts(db: Session, owner: User) -> list[ContactOut]:
    rows = db.execute(
        select(Contact, User)
        .join(User, User.id == Contact.contact_user_id)
        .where(Contact.owner_id == owner.id)
    ).all()
    return sorted((contact_out(c, u) for c, u in rows), key=_sort_key)


def nicknames_for(db: Session, owner_id: int) -> dict[int, str]:
    """contact_user_id -> nickname for the owner's contacts that have one."""
    rows = db.execute(
        select(Contact.contact_user_id, Contact.nickname).where(
            Contact.owner_id == owner_id, Contact.nickname.is_not(None)
        )
    ).all()
    return {user_id: nickname for user_id, nickname in rows}


def add_contact(db: Session, owner: User, phone: str, nickname: str | None = None) -> ContactOut:
    """phone must already be normalized."""
    target = db.scalar(select(User).where(User.phone == phone))
    if target is None:
        raise NotFound("No Signal account uses that number")
    if target.id == owner.id:
        raise BadRequest("That's your own number")
    exists = db.scalar(
        select(Contact.id).where(Contact.owner_id == owner.id, Contact.contact_user_id == target.id)
    )
    if exists is not None:
        raise Conflict("Already in your contacts")
    contact = Contact(owner_id=owner.id, contact_user_id=target.id, nickname=nickname)
    db.add(contact)
    db.commit()
    return contact_out(contact, target)
