from sqlalchemy.orm import Session

from .models import User

STARTING_CREDITS = 20
ANALYZE_COST     = 5
QUEUE_COST       = 50


def get_or_create_user(session_id: str, db: Session) -> User:
    user = db.query(User).filter(User.session_id == session_id).first()
    if not user:
        user = User(session_id=session_id, credits=STARTING_CREDITS)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user
