from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import BrewmasterQueue

router = APIRouter()


class QueueRequest(BaseModel):
    url: str
    video_id: str | None = None
    analysis_id: str | None = None
    session_id: str | None = None


class QueueUpdateRequest(BaseModel):
    status: str
    notes: str | None = None


@router.post("/queue")
def add_to_queue(req: QueueRequest, db: Session = Depends(get_db)):
    item = BrewmasterQueue(
        url=req.url,
        video_id=req.video_id,
        analysis_id=req.analysis_id,
        session_id=req.session_id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": item.status, "queued": True}


@router.get("/queue")
def list_queue(status: str = "pending", db: Session = Depends(get_db)):
    return (
        db.query(BrewmasterQueue)
        .filter(BrewmasterQueue.status == status)
        .order_by(BrewmasterQueue.created_at)
        .all()
    )


@router.patch("/queue/{item_id}")
def update_queue_item(item_id: str, req: QueueUpdateRequest, db: Session = Depends(get_db)):
    item = db.query(BrewmasterQueue).filter(BrewmasterQueue.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found")

    item.status = req.status
    item.notes = req.notes
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item
