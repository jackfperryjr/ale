from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import require_api_key
from ..db.database import get_db
from ..db.models import Analysis, BrewmasterQueue
from ..db.users import QUEUE_COST, can_spend, deduct, get_or_create_user

router = APIRouter()


class QueueRequest(BaseModel):
    url: str
    video_id: str | None = None
    analysis_id: str | None = None
    session_id: str | None = None


class QueueUpdateRequest(BaseModel):
    status: str
    notes: str | None = None


def _analysis_dict(a: Analysis | None) -> dict | None:
    if a is None:
        return None
    return {
        "id": a.id,
        "url": a.url,
        "video_id": a.video_id,
        "reality_score": a.reality_score,
        "label": a.label,
        "raw_result": a.raw_result,
        "status": a.status,
        "session_id": a.session_id,
        "created_at": a.created_at,
    }


def _queue_dict(item: BrewmasterQueue, analysis: Analysis | None = None) -> dict:
    return {
        "id": item.id,
        "url": item.url,
        "video_id": item.video_id,
        "analysis_id": item.analysis_id,
        "status": item.status,
        "notes": item.notes,
        "session_id": item.session_id,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "analysis": _analysis_dict(analysis),
    }


@router.post("/queue")
def add_to_queue(req: QueueRequest, db: Session = Depends(get_db)):
    user = get_or_create_user(req.session_id, db) if req.session_id else None
    if user and not can_spend(user, QUEUE_COST):
        raise HTTPException(status_code=402, detail="Insufficient credits")

    if user:
        deduct(user, QUEUE_COST)

    item = BrewmasterQueue(
        url=req.url,
        video_id=req.video_id,
        analysis_id=req.analysis_id,
        session_id=req.session_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": item.status, "queued": True, "daily_credits": user.daily_credits if user else None}


@router.get("/stats", dependencies=[Depends(require_api_key)])
def get_stats(db: Session = Depends(get_db)):
    queue_pending = (
        db.query(BrewmasterQueue)
        .filter(BrewmasterQueue.status.in_(["pending", "brewing", "reviewing"]))
        .count()
    )
    queue_verified = (
        db.query(BrewmasterQueue)
        .filter(BrewmasterQueue.status == "verified")
        .count()
    )
    total_analyses = db.query(Analysis).count()
    return {
        "queue_pending": queue_pending,
        "queue_verified": queue_verified,
        "total_analyses": total_analyses,
    }


@router.get("/queue", dependencies=[Depends(require_api_key)])
def list_queue(status: str = "pending", db: Session = Depends(get_db)):
    items = (
        db.query(BrewmasterQueue)
        .filter(BrewmasterQueue.status == status)
        .order_by(BrewmasterQueue.created_at)
        .all()
    )
    analysis_ids = [i.analysis_id for i in items if i.analysis_id]
    analyses = (
        {a.id: a for a in db.query(Analysis).filter(Analysis.id.in_(analysis_ids)).all()}
        if analysis_ids else {}
    )
    return [_queue_dict(item, analyses.get(item.analysis_id)) for item in items]


@router.get("/queue/{item_id}", dependencies=[Depends(require_api_key)])
def get_queue_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(BrewmasterQueue).filter(BrewmasterQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")
    analysis = (
        db.query(Analysis).filter(Analysis.id == item.analysis_id).first()
        if item.analysis_id else None
    )
    return _queue_dict(item, analysis)


@router.patch("/queue/{item_id}", dependencies=[Depends(require_api_key)])
def update_queue_item(item_id: str, req: QueueUpdateRequest, db: Session = Depends(get_db)):
    item = db.query(BrewmasterQueue).filter(BrewmasterQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    item.status = req.status
    item.notes = req.notes
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _queue_dict(item)
