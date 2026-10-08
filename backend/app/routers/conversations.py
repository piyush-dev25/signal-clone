from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime import events
from app.schemas.conversation import ConversationOut, DirectIn
from app.schemas.receipt import ReadIn, ReadOut
from app.services import conversations as conversation_service
from app.services import receipts as receipt_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return conversation_service.list_conversations(db, user)


@router.post("/direct", response_model=ConversationOut)
def open_direct(body: DirectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = conversation_service.get_or_create_direct(db, user, body.user_id)
    return conversation_service.get_conversation_out(db, user, conversation.id)


@router.post("/{conversation_id}/read", response_model=ReadOut)
def mark_read(
    conversation_id: int,
    body: ReadIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = receipt_service.mark_read(db, user, conversation_id, body.message_id)
    if result.update:  # every member's sockets, including the reader's other tabs
        events.schedule_push(background, result.member_ids, "receipt_update", result.update)
    return ReadOut(conversation_id=conversation_id, last_read=result.last_read, last_delivered=result.last_delivered)
