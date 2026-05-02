import uuid
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from .models import User

DAILY_FREE_CREDITS = 2
ANALYZE_COST = 1
QUEUE_COST = 25


def _reset_daily_if_needed(user: User) -> None:
    today = date.today()
    reset_date = user.credits_reset_date.date() if user.credits_reset_date else None
    if reset_date is None or reset_date < today:
        user.daily_credits = DAILY_FREE_CREDITS
        user.credits_reset_date = datetime.now(timezone.utc)


def can_spend(user: User, cost: int) -> bool:
    return user.daily_credits >= cost or user.credits >= cost


def deduct(user: User, cost: int) -> None:
    if user.daily_credits >= cost:
        user.daily_credits -= cost
    else:
        user.credits -= cost


def get_or_create_user(session_id: str, db: Session) -> User:
    user = db.query(User).filter(User.session_id == session_id).first()
    if not user:
        user = User(session_id=session_id)
        db.add(user)
        db.commit()
        db.refresh(user)
    _reset_daily_if_needed(user)
    return user


def get_or_create_user_by_google(google_id: str, email: str, db: Session) -> User:
    user = (
        db.query(User)
        .filter((User.google_id == google_id) | (User.email == email))
        .first()
    )
    if not user:
        user = User(
            session_id=str(uuid.uuid4()),
            google_id=google_id,
            email=email,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if not user.google_id:
            user.google_id = google_id
        if not user.email:
            user.email = email
    _reset_daily_if_needed(user)
    db.commit()
    return user
