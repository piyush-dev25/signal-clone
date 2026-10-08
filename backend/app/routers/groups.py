from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.realtime import events
from app.schemas.conversation import ConversationOut
from app.schemas.group import AddMembersIn, CreateGroupIn, RenameIn, RoleIn
from app.services import groups as group_service
from app.services.conversations import get_conversation_out

router = APIRouter(prefix="/conversations", tags=["groups"])


def _respond(background: BackgroundTasks, db: Session, user: User, change: group_service.GroupChange):
    events.schedule_group_change(background, db, change)
    return get_conversation_out(db, user, change.conversation_id)


@router.post("/group", response_model=ConversationOut)
def create_group(
    body: CreateGroupIn, background: BackgroundTasks, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return _respond(background, db, user, group_service.create_group(db, user, body.name, body.member_ids))


@router.patch("/{conversation_id}", response_model=ConversationOut)
def rename_group(
    conversation_id: int,
    body: RenameIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _respond(background, db, user, group_service.rename(db, user, conversation_id, body.name))


@router.post("/{conversation_id}/members", response_model=ConversationOut)
def add_members(
    conversation_id: int,
    body: AddMembersIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _respond(background, db, user, group_service.add_members(db, user, conversation_id, body.user_ids))


@router.delete("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
def remove_member(
    conversation_id: int,
    user_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _respond(background, db, user, group_service.remove_member(db, user, conversation_id, user_id))


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
def change_role(
    conversation_id: int,
    user_id: int,
    body: RoleIn,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _respond(background, db, user, group_service.change_role(db, user, conversation_id, user_id, body.role))


@router.post("/{conversation_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_group(
    conversation_id: int,
    background: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    events.schedule_group_change(background, db, group_service.leave(db, user, conversation_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
