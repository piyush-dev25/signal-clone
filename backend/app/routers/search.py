from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas.search import SearchOut
from app.services import search as search_service

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchOut)
def search(
    q: str = Query(min_length=1, max_length=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return search_service.search(db, user, q)
