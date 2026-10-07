from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.contact import AddContactIn, ContactOut
from app.services import contacts as contact_service

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("", response_model=list[ContactOut])
def list_contacts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return contact_service.list_contacts(db, user)


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def add_contact(body: AddContactIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return contact_service.add_contact(db, user, body.phone, body.nickname)
