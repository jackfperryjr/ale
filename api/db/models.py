import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String, Text

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
    content_type = Column(String)       # "image" | "video"
    trigger = Column(String)            # "cap_click" | "image_hover" | "manual_url"
    user_disagreed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=_now)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    session_id = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, nullable=True)
    google_id = Column(String, unique=True, nullable=True, index=True)
    credits = Column(Integer, nullable=False, default=0)
    daily_credits = Column(Integer, nullable=False, default=2)
    credits_reset_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_now)


class Donation(Base):
    __tablename__ = "donations"

    id = Column(String, primary_key=True, default=_uuid)
    source = Column(String, nullable=False)        # "github" | "stripe"
    event_type = Column(String, nullable=True)
    amount_cents = Column(Integer, nullable=True)
    currency = Column(String, nullable=False, default="usd")
    donor_name = Column(String, nullable=True)
    donor_email = Column(String, nullable=True)
    external_id = Column(String, nullable=True, unique=True, index=True)
    raw_payload = Column(JSON)
    created_at = Column(DateTime, default=_now)


class ApiError(Base):
    __tablename__ = "api_errors"

    id = Column(String, primary_key=True, default=_uuid)
    provider = Column(String, nullable=False)    # "hive"
    status_code = Column(Integer, nullable=False)
    retry_after = Column(Integer)                # seconds, from Retry-After header if present
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
