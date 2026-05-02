import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()

_engine = None
_SessionLocal = None


def _engine_():
    global _engine, _SessionLocal
    if _engine is None:
        url = os.getenv("DATABASE_URL", "")
        if not url:
            raise RuntimeError("DATABASE_URL is not set.")
        _engine = create_engine(url)
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def init_db():
    from . import models  # noqa: F401 — registers models with Base
    engine = _engine_()
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_credits INTEGER NOT NULL DEFAULT 2"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_reset_date TIMESTAMPTZ"))
        conn.commit()


def get_db():
    _engine_()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
