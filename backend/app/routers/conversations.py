from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.conversation import ConversationOut, DirectIn
from app.services import conversations as conversation_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return conversation_service.list_conversations(db, user)


@router.post("/direct", response_model=ConversationOut)
def open_direct(body: DirectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = conversation_service.get_or_create_direct(db, user, body.user_id)
    return conversation_service.get_conversation_out(db, user, conversation.id)
