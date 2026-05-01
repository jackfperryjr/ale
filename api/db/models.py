import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, JSON, String, Text

from .database import Base


def _now():
    return datetime.now(timezone.utc)


def _uuid():
    return str(uuid.uuid4())


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(String, primary_key=True, default=_uuid)
    url = Column(String, nullable=False, index=True)
    video_id = Column(String)
    reality_score = Column(Float)
    label = Column(String)
    raw_result = Column(JSON)
    # "pending" | "complete" | "error"
    status = Column(String, nullable=False, default="complete")
    session_id = Column(String, index=True)
    created_at = Column(DateTime, default=_now)


class BrewmasterQueue(Base):
    __tablename__ = "brewmaster_queue"

    id = Column(String, primary_key=True, default=_uuid)
    url = Column(String, nullable=False)
    video_id = Column(String)
    analysis_id = Column(String)
    # "pending" | "reviewing" | "verified" | "rejected"
    status = Column(String, nullable=False, default="pending")
    notes = Column(Text)
    session_id = Column(String, index=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now)
