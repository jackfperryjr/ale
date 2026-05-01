from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.users import get_or_create_user

router = APIRouter(prefix="/admin")


class TopUpRequest(BaseModel):
    session_id: str
    amount: int


@router.post("/credits")
def top_up_credits(req: TopUpRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(req.session_id, db)
    user.credits += req.amount
    db.commit()
    return {"session_id": req.session_id, "credits": user.credits}


@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    from ..db.models import User
    return db.query(User).order_by(User.created_at.desc()).all()
