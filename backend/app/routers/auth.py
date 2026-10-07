from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.auth import AuthOut, RequestOtpIn, VerifyIn
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp")
def request_otp(body: RequestOtpIn) -> dict:
    auth_service.request_otp(body.phone)
    return {"ok": True}


@router.post("/verify", response_model=AuthOut)
def verify(body: VerifyIn, db: Session = Depends(get_db)) -> AuthOut:
    user, is_new = auth_service.verify_otp(db, body.phone, body.otp)
    return AuthOut(token=auth_service.create_token(user.id), user=user, is_new=is_new)
