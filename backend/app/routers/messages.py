from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime import events
from app.schemas.message import MessageOut, SendMessageIn
from app.services import messages as message_service

router = APIRouter(prefix="/conversations/{conversation_id}/messages", tags=["messages"])


@router.get("", response_model=list[MessageOut])
def list_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return message_service.list_messages(db, user, conversation_id, before_id, limit)


@router.post("", response_model=MessageOut)
def send_message(
    conversation_id: int,
    body: SendMessageIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = message_service.send_message(db, user, conversation_id, body.client_id, body.body, body.reply_to_id)
    if result.created:  # an idempotent retry was already pushed the first time
        events.schedule_message_new(background, db, result)
    return result.message
