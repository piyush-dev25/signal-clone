from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime import events
from app.schemas.message import ReactionOut
from app.schemas.reaction import ReactionIn
from app.services import reactions as reaction_service

router = APIRouter(prefix="/messages/{message_id}/reaction", tags=["reactions"])


@router.put("", response_model=list[ReactionOut])
def set_reaction(
    message_id: int,
    body: ReactionIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = reaction_service.set_reaction(db, user, message_id, body.emoji)
    events.schedule_reaction_update(background, result)
    return result.reactions


@router.delete("", response_model=list[ReactionOut])
def remove_reaction(
    message_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = reaction_service.remove_reaction(db, user, message_id)
    events.schedule_reaction_update(background, result)
    return result.reactions
