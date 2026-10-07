from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.user import UpdateMeIn, UserOut
from app.services import users as user_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.put("", response_model=UserOut)
def update_me(
    body: UpdateMeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    return user_service.update_profile(db, user, body.model_dump(exclude_unset=True))
